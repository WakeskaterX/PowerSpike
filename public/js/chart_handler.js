var line_chart;
var DRAW_LIB = {
  drawChart: function(champ_data) {
    if (line_chart) line_chart.destroy();
    var canvas = document.getElementById("champion_results");
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    $("#champ_name").text(champ_data.name+", "+champ_data.title);
    //Set up our datasets and labels
    var label_array = [];
    var dataset_array = DRAW_LIB.createDatasetArray(champ_data.kill_data);
    for (var i = 0; i < 60; i++) {
      label_array.push(i.toString());
    }
    label_array.push("60+");
  
    var data = {
      labels: label_array,
      datasets: dataset_array
    };
    var options = {
      datasetFill: false,
      scaleGridLineWidth: 1
    };
    line_chart = new Chart(ctx).Line(data, options);
    document.getElementById("chart_legend").innerHTML = line_chart.generateLegend();
  },
  createDatasetArray: function(kill_data){
    var ds = [];
    var patch_info = [
      {"id": "patch_511_normal", "name": "Patch 5.11 Normals", "color": "rgba(255,0,0,1)"},
      {"id": "patch_514_normal", "name": "Patch 5.14 Normals", "color": "rgba(255,255,0,1)"},
      {"id": "patch_511_ranked", "name": "Patch 5.11 Ranked Solo Queue", "color": "rgba(0,255,0,1)"},
      {"id": "patch_514_ranked", "name": "Patch 5.14 Ranked Solo Queue", "color": "rgba(0,255,255,1)"}
    ]
    for (var i = 0; i < patch_info.length; i++) {
      var dataset_item = {};
      var data = kill_data[patch_info[i].id].kills;
      var games_played = kill_data[patch_info[i].id].games_played || 0;
      //If we have a blank object (no data for that section) just skip it and move to the next

      var kill_data_array = [];
      if (!!data && !!games_played){
        for (var j = 0; j < 60; j++) {
          var value = 0;
          if (data[j.toString()]) value = parseInt(data[j.toString()],10)/parseInt(games_played);
          kill_data_array.push(value);
        }
        var over_sixty = 0;
        for (var k = 60; k < 120; k++) {
          if (data[k.toString()]) over_sixty += parseInt(data[k.toString()],10)/parseInt(games_played);
        }
        kill_data_array.push(over_sixty);
      }
      dataset_item.data = kill_data_array;
      dataset_item.label = patch_info[i].name + " (Total Games: "+games_played+" )";
      dataset_item.strokeColor = patch_info[i].color;
      dataset_item.pointColor = patch_info[i].color;
  
      ds.push(dataset_item);
    }
    return ds;
  }
}