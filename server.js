/**
 * Web Server - Supplies static data and lets us access Mongo Objects
 */
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var async = require('async');
var mongo_url = "mongodb://localhost:27017/champion_data";
var MongoClient = require('mongodb').MongoClient;
var async = require('async');
var request = require('request');
var api_key = "API_KEY_HERE";

var static_champion_endpoint = "https://na.api.pvp.net/api/lol/static-data/na/v1.2/champion?api_key="+api_key;

var all_champion_data = {};

var app = express();
var mongo_db;

app.use(bodyParser.json());

//When we get a champion name request we'll access MongoDB and return the data we need
app.get('/champion/:name', function(req, res) {
  console.log("Recieved Champion Data Request for champion: "+req.params.name);
  var champ_name = req.params.name;
  //The Results Object stores the data to return
  var results_object = {
    name: "",
    title: "",
    id: 0,
    kill_data: {}
  };
  var found_champ = getValidChampionName(champ_name);
  var name_regex;
  //Case insensitive Regex so we can get better match results
  if (found_champ) {
    results_object.key = found_champ.key;
    name_regex = new RegExp('^'+found_champ.name+'$', "i");
  } else {
    res.status(404).send("NOT FOUND");
    return;
  }
  //In Parallel, we're going to query mongodb in all 4 collections for our champion name
  //When we find that champion, check if this is the first one we found and update the results_object
  //Then once all 4 parallel processes complete, we'll have our games_played and kills object on paired ot each key name
  async.parallel({
    "patch_511_normal": function(cb) {
      mongo_db.collection("patch_5_11").findOne({"name": name_regex}, function(err, doc) {
        if (!err && doc) {
          //If we haven't set the name, title and ID for this champ yet, set it now
          if (results_object.name === "") results_object.name = doc.name;
          if (results_object.title === "") results_object.title = doc.title;
          if (results_object.id === 0) results_object.id = doc.champ_id;
          cb(null, {kills: doc.kills, games_played: doc.games_played});
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
          cb(null, {kills: doc.kills, games_played: doc.games_played});
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
          cb(null, {kills: doc.kills, games_played: doc.games_played});
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
          cb(null, {kills: doc.kills, games_played: doc.games_played});
        } else {
          cb(null, {});
        }
      });
    }
  }, function(err, results) {
    if (err) console.error(err);
    results_object.kill_data = results;
    //Finally Stringify the data and return
    res.send(JSON.stringify(results_object));
  });
});

//Redirect to our index.html at the root
app.get('/', function(req, res) {
  res.redirect('/index.html');
});

//Use our public folder for static files
app.use(express.static('public'));

//Spin up our application on port 3000 and connect to mongoDb
app.listen(3000, function() {
  request(static_champion_endpoint, function(err, response, body) {
    if (response.statusCode == 200) {
      console.log("Saving all champion data");
      all_champion_data = JSON.parse(body).data;
    } else {
      console.log("Could not get all champion data!  Recieved response code: "+JSON.stringify(response));
    }
    console.log("Connecting to Mongo...");
    MongoClient.connect(mongo_url, function(err, db) {
      if (err) console.log(err);
      else console.log("Connected to MongoDB!");
      mongo_db = db;
      console.log("Web Server started!  Listening on port 3000...");
    });
  })
});

/**
 * getValidChampionName takes the query, and searches for a valid champion from
 * all our champion data and returns a valid champion to use for the mongo query
 * @param {string} search_query
 * @returns {string}
 */
function getValidChampionName(search_query) {
  var exact_regex = new RegExp('^'+search_query+"$", "i");
  var search_regex = new RegExp('^'+search_query, 'i');
  for (var key in all_champion_data) {
    if (all_champion_data[key].name.match(exact_regex)) {
      return all_champion_data[key].name;
    }
  }
  for (var key in all_champion_data) {
    if (all_champion_data[key].name.match(search_regex)) {
      return all_champion_data[key].name;
    }
  }
  //Default to our search query
  return null;
}