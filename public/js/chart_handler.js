var line_chart;

//Draw Library Global Namespace
var DRAW_LIB = {
  /**
   * DrawChart
   * @param {object} champ_data - all of our data from the server
   */
  drawChart: function(champ_data) {
    //if we have a line chart already, destroy it so we can redraw
    if (line_chart) line_chart.destroy();

    //set up our canvas and get it ready for drawing
    var canvas = document.getElementById("champion_results");
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    //Update our champion name header
    $("#champ_name").text(champ_data.name+", "+champ_data.title);
    //Set up our datasets and labels
    var label_array = [];
    var dataset_array = DRAW_LIB.createDatasetArray(champ_data.kill_data);
    for (var i = 0; i < 60; i++) {
      label_array.push(i.toString());
    }
    label_array.push("60+");

    //Update our data object for the chart
    var data = {
      labels: label_array,
      datasets: dataset_array
    };
    //Chart options
    var options = {
      datasetFill: false,
      scaleGridLineWidth: 1
    };
    //Create our chart
    line_chart = new Chart(ctx).Line(data, options);
    //Set the inner HTML of the chart_legend to our legend
    document.getElementById("chart_legend").innerHTML = line_chart.generateLegend();
  },
  /**
   * Create Dataset Array
   * @param {object} kill_data - all of the kill data and games_played data
   * for the four collections
   */
  createDatasetArray: function(kill_data){
    var ds = [];
    //Set up patch info with colors, etc
    var patch_info = [
      {"id": "patch_511_normal", "name": "Patch 5.11 Normals", "color": "rgba(255,0,0,1)"},
      {"id": "patch_514_normal", "name": "Patch 5.14 Normals", "color": "rgba(255,255,0,1)"},
      {"id": "patch_511_ranked", "name": "Patch 5.11 Ranked Solo Queue", "color": "rgba(0,255,0,1)"},
      {"id": "patch_514_ranked", "name": "Patch 5.14 Ranked Solo Queue", "color": "rgba(0,255,255,1)"}
    ]
    for (var i = 0; i < patch_info.length; i++) {
      var dataset_item = {};
      var data = kill_data[patch_info[i].id].kills;
      var games_played = kill_data[patch_info[i].id].games_played || 0;  //default to zero for the label

      var kill_data_array = [];
      //If we have a blank object (no data for that section) just skip it and move to the next
      if (!!data && !!games_played){
        for (var j = 0; j < 60; j++) {
          var value = 0;
          if (data[j.toString()]) value = parseInt(data[j.toString()],10)/parseInt(games_played);
          kill_data_array.push(value);
        }
        var over_sixty = 0;
        //Combine all data over sixty minutes into the last data point so we can see it all on the graph
        for (var k = 60; k < 120; k++) {
          if (data[k.toString()]) over_sixty += parseInt(data[k.toString()],10)/parseInt(games_played);
        }
        kill_data_array.push(over_sixty);
      }
      //Get our DataSet Item information set
      dataset_item.data = kill_data_array;
      dataset_item.label = patch_info[i].name + " (Total Games: "+games_played+" )";
      dataset_item.strokeColor = patch_info[i].color;
      dataset_item.pointColor = patch_info[i].color;

      //Push the data to our return array
      ds.push(dataset_item);
    }
    return ds;
  }
}