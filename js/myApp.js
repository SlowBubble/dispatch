
db = new Dexie('MyDatabase');


	// Define a schema
	db.version(1)
		.stores({
      subjects: '++id, name',
			persons: '++id, name, *subjects, *friends'
		});

var myApp = angular.module("myApp", []);
myApp.controller('mainCtr', ['$scope', function($scope) {
  var ctr = this;
  $scope.subjectBatch = [];
  loadSubjectsFromDb();
  loadPersonsFromDb();

  ctr.createSubject = function() {
    subjectDao.create($scope.subjectNameInput).then(function() {
      alert("Created subject.");
    });
    loadSubjectsFromDb();
  }

  ctr.createPerson = function() {
    personDao.create($scope.personNameInput, $scope.subjectBatch, []).then(function() {
      alert("Created person");
    });
    $scope.subjectBatch = [];
    loadPersonsFromDb();
  }

  ctr.addSubjectToBatch = function() {
    console.log("Adding to batch: " + $scope.subjectForPersonInput);
    subjectDao.get($scope.subjectForPersonInput).then(function(subject) {
      if (subject == null) {
        alert("Invalide subject");
      } else {
        $scope.subjectBatch.push($scope.subjectForPersonInput);
        $scope.subjectForPersonInput = '';
        $scope.$apply();
      }
    });
  }

  ctr.addFriend = function() {
    var retrievePromise = Promise.all([
      personDao.get($scope.friendSource),
      personDao.get($scope.friendTarget)
    ]);
    retrievePromise.then(function(values) {
      var source = values[0];
      var target = values[1];
      if (source == null || target == null) {
        alert("Invalid data provided");
      } else {
        var sourceFriends = source.friends;
        var targetFriends = target.friends;
        var targetName = target.name;
        var sourceName = source.name;
        if (targetName === sourceName) {
          alert("Can't add yourself as a friend.");
        } else if (sourceFriends.indexOf(targetName) > -1) {
          alert("No update because the friend exists already");
        } else {
          sourceFriends.push(targetName);
          targetFriends.push(sourceName);
          addFriendAndAlert();
        }
      }

      function addFriendAndAlert() {
        var addFriendPromise = personDao.addFriend(source.id, sourceFriends);
        var addReverseFriendPromise = personDao.addFriend(target.id, targetFriends);

        Promise.all([addFriendPromise, addReverseFriendPromise]).then(function() {
          alert("Added friend.");
        }).catch (function (e) {
          alert("Unable to update due to database error");
          console.log('error: ' + e);
        });
      }
    });
  }

  // Return a path of friends, or an empty path
  ctr.computeConnection = function() {
    var visitedList = [$scope.connectionSource];
    var pathList = [[$scope.connectionSource]];
    processRecursively(pathList, visitedList, $scope.connectionSubjectInput).then(function(result) {
      $scope.connection = result;
      $scope.$apply();
    });

    function processRecursively(pathList, visitedList, subject) {
      console.log("processing the path list: " + pathList);
      if (pathList.length === 0) {
        return "None";
      }
      var nextPathList = [];
      var listOfPromisesOfListOfValidPathPromises = pathList.map(function(path) {
        var end = path.slice(-1)[0];
        console.log("Querying for person " + end);
        var personPromise = personDao.get(end);
        var promiseOfListOfFriendPromises = personPromise.then(function(person) {
          return person.friends.map(function(friendName) {
            console.log("Querying for friend " + friendName);
            return personDao.get(friendName);
          });
        });
        return promiseOfListOfFriendPromises.then(function(listOfFriendPromises) {
          return listOfFriendPromises.map(function(friendPromise) {
            return friendPromise.then(getValidPathOrUpdateNextPathList);
          });
        });
        function getValidPathOrUpdateNextPathList(friend) {
          if (visitedList.indexOf(friend.name) === -1) {
            var newPath = path.concat([friend.name]);
            if (friend.subjects.indexOf(subject) > -1) {
              console.log("found a good path: " + JSON.stringify(newPath));
              return newPath;
            } else {
              console.log("found a potential path: " + newPath);
              visitedList.push(friend.name);
              nextPathList.push(newPath);
              return null;
            }
          } else {
            console.log("Not examining a visited friend " + friend);
            return null;
          }
        }
      });
      var promiseOfListOfListOfValidPath = toPromiseOfListOfList(listOfPromisesOfListOfValidPathPromises);
      return promiseOfListOfListOfValidPath.then(function(listOfListOfValidPath) {
        var listOfValidPath = listOfListOfValidPath.reduce(function(a, b) {
          return a.concat(b);
        }, []);
        var filtered = listOfValidPath.filter(function(path) {
          return path !== null;
        });
        console.log("list Of Valid Path: " + JSON.stringify(filtered));
        if (filtered.length > 0) {
          return filtered[0];
        } else {
          return processRecursively(nextPathList, visitedList, subject);
        }
      });
    }
  }

  function loadSubjectsFromDb() {
    subjectDao.getAll().toArray(function(subjects) {
      $scope.subjects = subjects;
      $scope.$apply();
    });
  }

  function loadPersonsFromDb() {
    personDao.getAll().toArray(function(persons) {
      $scope.persons = persons;
      $scope.$apply();
    });
  }

}]);

var subjectDao = {
  create: function(subjectName) {
    console.log("Adding subject: " + subjectName );
    return db.subjects.add({name: subjectName});
  },
  getAll: function(result) {
    return db.subjects;
  },
  get: function(name) {
    return db.subjects.where('name').equals(name).toArray(function(subjects) {
      if (subjects.length === 1) {
        return subjects[0];
      } else {
        console.log("Unable to get unique result: " + subjects);
        return null;
      }
    });
  }
}

var personDao = {
  create: function(name, subjects, friends) {
    console.log("Adding person: " + name );
    return db.persons.add({name: name, subjects: subjects, friends: friends});
  },
  getAll: function() {
    return db.persons;
  },
  get: function(name) {
    return db.persons.where('name').equals(name).toArray(function(persons) {
      if (persons.length === 1) {
        return persons[0];
      } else {
        console.log("Unable to get unique result: " + persons);
        return null;
      }
    });
  },

  addFriend: function(id, friends) {
    return db.persons.update(id,{friends: friends});
  }
}

 function toPromiseOfListOfList(listOfPromiseOfListOfPromise) {
  promiseOfListOfListOfPromise = Promise.all(listOfPromiseOfListOfPromise);
  promiseOfListOfPromiseOfList = promiseOfListOfListOfPromise.then(function(listOfList){
    return listOfList.map(function(listOfPromises) {
      return Promise.all(listOfPromises)
    })
  });
  return promiseOfListOfPromiseOfList.then(function(listOfPromise) {
    return Promise.all(listOfPromise);
  });
}
