var MongoClient = require('mongodb').MongoClient;
var request = require('request');
var fs = require('fs');
var async = require('async');
var mongo_url = "mongodb://localhost:27017/champion_data";
var riot_api_base = "https://na.api.pvp.net"
var riot_api_key = "5c444333-299b-4876-bcce-d2ddeeb5e5bc";

var riot_data_511_normal = require('./app/riot_match_data/5.11/NORMAL_5X5/NA.json');
var riot_data_514_normal = require('./app/riot_match_data/5.14/NORMAL_5X5/NA.json');
var riot_data_511_ranked = require('./app/riot_match_data/5.11/RANKED_SOLO/NA.json');
var riot_data_514_ranked = require('./app/riot_match_data/5.14/RANKED_SOLO/NA.json');

var matched_ids = require('./data/match_ids_parsed.json');

//Static Varialbes
var champKillEvent = "CHAMPION_KILL";
var mongo_db;
var mongo_collections = {
  PRE_UPDATE: "patch_5_11",
  POST_UPDATE: "patch_5_14",
  PRE_UPDATE_RANKED: "patch_5_11_ranked",
  POST_UPDATE_RANKED: "patch_5_14_ranked"
}

var process_data = [
  {
    "data": riot_data_511_normal,
    "collection": mongo_collections.PRE_UPDATE,
    "name": "Patch 5.11 Normals"
  },{
    "data": riot_data_514_normal,
    "collection": mongo_collections.POST_UPDATE,
    "name": "Patch 5.14 Normals"
  },{
    "data": riot_data_511_ranked,
    "collection": mongo_collections.PRE_UPDATE_RANKED,
    "name": "Patch 5.11 Ranked"
  },{
    "data": riot_data_514_ranked,
    "collection": mongo_collections.POST_UPDATE_RANKED,
    "name": "Patch 5.14 Ranked"
  }
]

var current_dataset = 0;
var processing = false;

//Processing Queue
var to_process = [];

var rate_limit_wait = 25000;
/** The goal of this script is to make requests to the riot API in a timely manner and
 *  save the relevant data to a postgres database.
 */

function _init(callback){
  processing = true;
  MongoClient.connect(mongo_url, function(err, db) {
    if (err) console.log(err);
    mongo_db = db;
    callback(err);
  });
}

function _close() {
  console.log("Closing Mongo");
  mongo_db.close();
  process.exit(1);
}


function getMatchData(match_id, collection, main_callback) {
  request(buildMatchUrl(match_id), function(error, response, body) {
    if (error) console.error(error);
    //Data we need:
    /**
     * ChampID:  body.participants[i].championId
     * ParticipantID: body.participants[i].participantId
     * Events:   body.timeline.frames[].events[]
     * Champ Kill Event:  eventType: CHAMPION_KILL, killerId, victimId, assistingParticipantIds[], timestamp
     */
    try {
      var data = JSON.parse(body);
    } catch (e) {
      if (response.statusCode != 404) {
        console.log("We're rate limited!, waiting and retrying... ");
        //If we're rate limited, set a timeout to our rate_limit_wait and return so we wait and callback when we can
        //But only do this if the match wasn't found, else just callback
        setTimeout(function(){
          getMatchData(match_id, collection, main_callback)
        },rate_limit_wait);
        return;
      } else {
        console.log("The match id: "+match_id+" wasn't found!  Skipping!");
        main_callback();
        return;
      }
    }
    console.log("Recieved Data from RIOT API");
    var participants = data.participants;
    
    //First get our player_mapping so we can attribute kills to specific champions
    var player_map = {}; // {participantId: championId}
    var champion_ids = [];
    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      player_map[p.participantId.toString()] = p.championId.toString();
      champion_ids.push(p.championId.toString());
    }
  
    //Next iterate through all of our events frames and get all our champion kill events
    var kills = [];  //Kill = { champ_id: 1, champ_name: "Annie", timestamp: 12345 }
    var event_frames = data.timeline.frames;
    for (var i = 0; i < event_frames.length; i++) {
      var events = event_frames[i].events || [];
      for (var j = 0; j < events.length; j++) {
        //Now look through our events for eventType of CHAMPION_KILL
        if (events[j].eventType === champKillEvent) {
          var kill_event = events[j];
          var champId = player_map[kill_event.killerId];
          var timestamp = convertTimestamp(kill_event.timestamp);
          kills.push({champ_id: champId, timestamp: timestamp});
        }
      }
    }
    console.log("Parsed Kills, updating champion info...");
    async.each(kills, function(item, callback) {
      getChampInfo(item.champ_id, function(err, champ) {
        if (!err) {
          item.champ_name = champ.name;
          item.champ_title = champ.title;
          callback();
        } else {
          callback(err);
        }
      })
    }, function(err) {
      if (err) {
        console.log("We had some errors trying to parse kills: "+err);
        console.log("Skipping to the next match");
        main_callback();
      } else {
        console.log("Saving to MongoDB");
        saveToDatabase(champion_ids, kills, collection, main_callback);
      }
    });
  });
}

function buildMatchUrl(match_id) {
  return riot_api_base + "/api/lol/na/v2.2/match/" + match_id + "?api_key="+riot_api_key+"&includeTimeline=true";
}

function buildChampDataUrl(champ_id) {
  return riot_api_base + "/api/lol/static-data/na/v1.2/champion/"+champ_id+"?api_key="+riot_api_key;
}


function getChampInfo(champ_id, callback) {
  var url = buildChampDataUrl(champ_id);
  request(url, function(err, res, body) {
    if (res.statusCode == 200) {
      try {
        var data = JSON.parse(body);
      } catch(e) {
        console.log("ERROR: Could not parse data for champion id: "+champ_id);
        callback(e);
      }
      callback(err, data);
    } else if (res.statusCode == 404) {
      //Couldn't find champ
      console.log("Could Not find champion data for champion id: "+champ_id);
      callback(null, {name: "UNKNOWN", title: "of the UNKNOWN CLAN"});
    } else {
      callback(new Error("Invalid Status Code Returned: "+res.statusCode));
    }
  });
}

function convertTimestamp (timestamp) {
  if (typeof timestamp === "string") timestamp = parseInt(timestamp, 10);
  return Math.floor(timestamp/60000);  //Return the Minute on which teh kill happened
}

function saveToDatabase (champion_ids, kills, col, main_callback) {
  if (mongo_db) {
    async.parallel([
      function(callback) {
        async.each(kills, function(ke, cb) {
          //Update the kill event in mongodb
          var filter = {champ_id: ke.champ_id};
          var increment_action = {};
          increment_action["kills."+ke.timestamp] = 1;
          var update = { $set: { name: ke.champ_name, title: ke.champ_title }, $inc: increment_action };
          var options = { upsert: true };
          mongo_db.collection(col).updateOne(filter, update, options, cb);
        }, function (err) {
          if (err) console.error(err);
          else console.log("Updated Kills in mongo db!");
          callback(err);
        });
      },
      function (callback) {
        async.each(champion_ids, function (champ, cb) {
          var filter = { champ_id: champ };
          var increment_action = { games_played: 1 };
          var update = { $inc: increment_action };
          var options = { upsert: true };
          mongo_db.collection(col).updateOne(filter, update, options, cb);
        }, function(err) {
          if (err) console.error(err);
          else console.log("Updated Games Played in mongo db!");
          callback(err);
        })
      }
    ], function(err) {
      if (err) {
        console.error("Error saving to Mongo!"+err);
      }
      main_callback(err);
    });
  } else {
    console.log("ERROR: Mongo is not instantiated yet!");
    main_callback();
  }
}

function runProcess() {
  _init(function(err) {
    fillQueue();
    console.log("Enqueued items!  "+to_process.length+" items left to process!");
    processMatch(to_process.shift());
  })
}

function fillQueue() {
  //Iterate through our 4 data types and fill our queue with the data we need
  for (var i = 0; i < 4; i++) {
    for (var j = 0; j < process_data[i].data.length; j++) {
      var match = process_data[i].data[j];
      //If we have have not parsed this match already, add it to the queue
      if (matched_ids.indexOf(match) === -1) {
        to_process.push({"match": match, "collection": process_data[i].collection});
      }
    }
  }
}

function processMatch(match_item) {
  console.log("Processing Match ID: "+match_item.match+" on collection "+match_item.collection);
  getMatchData(match_item.match, match_item.collection, function(err){
    //Now that it was a success save our match_id to the array and write it to a file
    save_matched_ids(match_item.match, function(err) {
      console.log("Finished getting data for match id: "+match_item.match+", waiting "+rate_limit_wait+" ms for the next query to RIOT API");
      if (to_process.length > 0) {
        setTimeout(function() {
          processMatch(to_process.shift());
        },rate_limit_wait);
      } else {
        cleanUp();
      }
    });
  });
}

function save_matched_ids(match_id, callback) {
  matched_ids.push(match_id);
  fs.writeFile("./data/match_ids_parsed.json", JSON.stringify(matched_ids), function(err) {
    if (err) console.error(err);
    callback();
  })
}

function cleanUp() {
  console.log("Finished Processing!  Closing MongoDB Collection");
  _close();
}

//Start up our process!
runProcess();