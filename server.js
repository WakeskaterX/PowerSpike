/**
 * Article Server - stands up an HTTP server for local requests that allows our Curator to post 
 */
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var async = require('async');
var mongo_url = "mongodb://localhost:27017/champion_data";
var MongoClient = require('mongodb').MongoClient;
var async = require('async');

var app = express();
var mongo_db;

app.use(bodyParser.json());

app.get('/champion/:name', function(req, res) {
  console.log("Recieved Champion Data Request for champion: "+req.params.name);
  var champ_name = req.params.name;
  var results_object = {
    name: "",
    title: "",
    id: 0,
    kill_data: {}
  };
  var name_regex = new RegExp(champ_name, "i");
  async.parallel({
    "patch_511_normal": function(cb) {
      mongo_db.collection("patch_5_11").findOne({"name": name_regex}, function(err, doc) {
        if (!err && doc) {
          if (results_object.name === "") results_object.name = doc.name;
          if (results_object.title === "") results_object.title = doc.title;
          if (results_object.id === 0) results_object.id = doc.champ_id;
          cb(null, doc.kills);
        } else {
          cb(null, {});
        }
      });
    },
    "patch_514_normal": function(cb) {
      mongo_db.collection("patch_5_14").findOne({"name": name_regex}, function(err, doc) {
        if (!err && doc) {
          if (results_object.name === "") results_object.name = doc.name;
          if (results_object.title === "") results_object.title = doc.title;
          if (results_object.id === 0) results_object.id = doc.champ_id;
          cb(null, doc.kills);
        } else {
          cb(null, {});
        }
      });
    },
    "patch_511_ranked": function(cb) {
      mongo_db.collection("patch_5_11_ranked").findOne({"name": name_regex}, function(err, doc) {
        if (!err && doc) {
          if (results_object.name === "") results_object.name = doc.name;
          if (results_object.title === "") results_object.title = doc.title;
          if (results_object.id === 0) results_object.id = doc.champ_id;
          cb(null, doc.kills);
        } else {
          cb(null, {});
        }
      });
    },
    "patch_514_ranked": function(cb) {
      mongo_db.collection("patch_5_14_ranked").findOne({"name": name_regex}, function(err, doc) {
        if (!err && doc) {
          if (results_object.name === "") results_object.name = doc.name;
          if (results_object.title === "") results_object.title = doc.title;
          if (results_object.id === 0) results_object.id = doc.champ_id;
          cb(null, doc.kills);
        } else {
          cb(null, {});
        }
      });
    }
  }, function(err, results) {
    if (err) console.error(err);
    results_object.kill_data = results;
    res.send(JSON.stringify(results_object));
  });
});

app.get('/', function(req, res) {
  res.redirect('/index.html');
});

app.use(express.static('public'));

app.listen(3000, function() {
  console.log("Connecting to Mongo...");
  MongoClient.connect(mongo_url, function(err, db) {
    if (err) console.log(err);
    else console.log("Connected to MongoDB!");
    mongo_db = db;
    console.log("Web Server started!  Listening on port 3000...");
  });
});