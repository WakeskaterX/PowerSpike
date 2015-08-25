/**
 * Riot Parser is a parsing script that iterates through the Riot Match Data and fills a mongo database
 * with champion kill stats for the games played
 */
var MongoClient = require('mongodb').MongoClient;
var request = require('request');
var fs = require('fs');
var async = require('async');
var mongo_url = "mongodb://localhost:27017/champion_data";
var riot_api_base = "https://na.api.pvp.net"
var riot_api_key = "API_KEY_HERE";

//These are arrays of the four data types we'll use for our parser
var riot_data_511_normal = require('./app/riot_match_data/5.11/NORMAL_5X5/NA.json');
var riot_data_514_normal = require('./app/riot_match_data/5.14/NORMAL_5X5/NA.json');
var riot_data_511_ranked = require('./app/riot_match_data/5.11/RANKED_SOLO/NA.json');
var riot_data_514_ranked = require('./app/riot_match_data/5.14/RANKED_SOLO/NA.json');

//This is where we store the match IDs we've already processed so we do not process them again
var matched_ids = require('./data/match_ids_parsed.json');

//Static Varialbes
var champKillEvent = "CHAMPION_KILL";

//MongoDB and Mongo Collection
var mongo_db;
var mongo_collections = {
  PRE_UPDATE: "patch_5_11",
  POST_UPDATE: "patch_5_14",
  PRE_UPDATE_RANKED: "patch_5_11_ranked",
  POST_UPDATE_RANKED: "patch_5_14_ranked"
}

//Process Data - here we have an object to have our data tied to mongodb collections
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

//Boolean flag for whether or not we are processing
var processing = false;

//Processing Queue - This is our main work queue - all match IDs to parse get pulled from here
var to_process = [];

//This is the time to wait in Milliseconds between calls to the RIOT api so we don't get rate limited
var rate_limit_wait = 25000;

/**
 * Init - sets up MongoDB and preps us to process
 * @param callback
 */
function _init(callback){
  processing = true;
  MongoClient.connect(mongo_url, function(err, db) {
    if (err) console.log(err);
    mongo_db = db;
    callback(err);
  });
}

/**
 * Close - shuts down MongoDB and exits the process
 */
function _close() {
  processing = false;
  console.log("Closing Mongo");
  mongo_db.close();
  process.exit(1);
}

/**
 * Get Match Data is the bulk of the work.  Here we request to the RIOT API,
 * parse our data, pull out the things we need and format it so we can save it to the database
 * @param {string|int} match_id - the match ID we're parsing
 * @param {string} collection - the name of the MongoDB collection to save to
 * @param callback - main_callback
 */
function getMatchData(match_id, collection, main_callback) {
  request(buildMatchUrl(match_id), function(error, response, body) {
    if (error) console.error(error);
    /**
     * Data We need to parse:
     * ChampID:  body.participants[i].championId
     * ParticipantID: body.participants[i].participantId
     * Events:   body.timeline.frames[].events[]
     * Champ Kill Event:  eventType: CHAMPION_KILL, killerId, victimId, assistingParticipantIds[], timestamp
     */
    try {
      //Try to parse the JSON.  If it fails, we were returned an error so lets try to figure out why
      var data = JSON.parse(body);
    } catch (e) {
      //If it's not a Not Found (404) response, we'll just assume we're rate limited for now
      if (response.statusCode != 404) {
        console.log("We're rate limited!, waiting and retrying... ");
        //If we're rate limited, set a timeout to our rate_limit_wait and return so we wait and callback when we can
        //But only do this if the match wasn't found, else just callback
        setTimeout(function(){
          getMatchData(match_id, collection, main_callback)
        },rate_limit_wait);
        return;
      } else {
        //If this was a Not Found issue, we'll just skip it
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

    //Error Checking
    if (!participants || !participants.length) {
        console.log("The match id: "+match_id+" had Bad Data!  Skipping!");
        main_callback();
        return;
    }

    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      player_map[p.participantId.toString()] = p.championId.toString();
      //Store our champion IDs so we can iterate through them and increment the games played
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
    //For Each kill, lets get the champion info and then save the data to the database
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
        //Store the data in MongoDB
        saveToDatabase(champion_ids, kills, collection, main_callback);
      }
    });
  });
}

/**
 * Build Match URL - builds out the URL for getting match data
 * @param {string|int} match_id - id of the match to get
 * @returns {string} url - the path URL to request to
 */
function buildMatchUrl(match_id) {
  return riot_api_base + "/api/lol/na/v2.2/match/" + match_id + "?api_key="+riot_api_key+"&includeTimeline=true";
}

/**
 * Build Match URL - builds out the URL for getting champion data
 * @param {string|int} champ_id - id of the champ to get info for
 * @returns {string} url - the path URL to request to
 */
function buildChampDataUrl(champ_id) {
  return riot_api_base + "/api/lol/static-data/na/v1.2/champion/"+champ_id+"?api_key="+riot_api_key;
}

/**
 * Get Champ Info - gets champion information & metadata
 * @param {string|int} champ_id
 * @param callback
 */
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

/**
 * Converts a TimeStamp in milliseconds to the minute the event happened.
 * @param {int} timestamp - ms timestamp of the event
 * @returns {int} - minute time of the event
 */
function convertTimestamp (timestamp) {
  if (typeof timestamp === "string") timestamp = parseInt(timestamp, 10);
  return Math.floor(timestamp/60000);  //Return the Minute on which teh kill happened
}

/**
 * Save To Database - saves our champion and kill data to mongoDB
 * @param {string[]|int[]} champion_ids - array of champion IDs to increment the games_played
 * @param {object[]} kills - kill data object to increment against the champions
 * @param {string} col - collection in mongoDB to update
 * @param callback - main_callback
 */
function saveToDatabase (champion_ids, kills, col, main_callback) {
  if (mongo_db) {
    //In Parallel, lets update our champion games played and our kill data
    async.parallel([
      function(callback) {
        //For each item in our kill data, build out our parameters for the mongoDB Update
        //and update the item
        async.each(kills, function(ke, cb) {
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
      //For each champion in this game, update the games played by incrementing by 1
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
      //Finally we updated everything so lets call back
      main_callback(err);
    });
  } else {
    console.log("ERROR: Mongo is not instantiated yet!");
    main_callback();
  }
}

/**
 * Run Process - main entry point for the application
 * Starts the processMatch loop which will enqueue processing with setTimeout until
 * we run out of data to process
 */
function runProcess() {
  _init(function(err) {
    fillQueue();
    console.log("Enqueued items!  "+to_process.length+" items left to process!");
    processMatch(to_process.shift());
  })
}


/**
 * Fill Queue
 * fills our queue with the data from the Riot Data Sets
 * and formats it so we can easily use it
 */
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

/**
 * Take an item from our queue and process it
 * @param {object} match_item
 * @param {string|int} match_item.match
 * @param {string} match_item.collection
 * Note: Will call this same function again as long as we have items to process
 */
function processMatch(match_item) {
  console.log("Processing Match ID: "+match_item.match+" on collection "+match_item.collection);
  getMatchData(match_item.match, match_item.collection, function(err){
    //Now that it was a success save our match_id to the array and write it to a file
    save_matched_ids(match_item.match, function(err) {
      console.log("Finished getting data for match id: "+match_item.match+", waiting "+rate_limit_wait+" ms for the next query to RIOT API");
      if (to_process.length > 0) {
        setTimeout(function() {
          //Shift an item off of the front of our array and process it
          processMatch(to_process.shift());
        },rate_limit_wait);
      } else {
        cleanUp();
      }
    });
  });
}

/**
 * Save Matched IDS
 * save our IDS that we have already processed so if we crash and start up again, we don't process them twice
 * @param {string|int} match_id
 * @param callback
 */
function save_matched_ids(match_id, callback) {
  matched_ids.push(match_id);
  fs.writeFile("./data/match_ids_parsed.json", JSON.stringify(matched_ids), function(err) {
    if (err) console.error(err);
    callback();
  })
}

/**
 * Clean Up Function
 * Somewhat redundant at the moment - here for cleaning up anything before we shut down mongodb
 * @calls _close()
 */
function cleanUp() {
  console.log("Finished Processing!  Closing MongoDB Collection");
  _close();
}

//Start up our process and let it go!  You should run this as a daemon preferably
runProcess();