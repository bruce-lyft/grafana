define([
  'angular',
  'app',
  'jquery',
  'lodash',
  'kbn',
  'moment',
  'components/timeSeries',
  'services/panelSrv',
  'services/annotationsSrv',
  'services/datasourceSrv',
],
function (angular, app, $, _, kbn, moment, TimeSeries) {
  'use strict';

  var module = angular.module('grafana.panels.uptime', []);
  app.useModule(module);

  module.controller('uptime', function($scope, $rootScope, panelSrv, annotationsSrv, timeSrv) {
    $scope.panelMeta = {
      description : "An text panel that displayed percent uptime, where "
      +"uptime is the percent of time that a given metric is below a given threshold"
    };

    // Set and populate defaults
    var _d = {
      /** @scratch /panels/text/5
       * metric:: the metric to measure
       *
       *
       */
      datasource: null,
      target1    : "",
      threshold1 : "",
      target2    : "",
      threshold2 : "",
      uptime: "",
      style: {},
    };

    _.defaults($scope.panel,_d);

    $scope.updateTimeRange = function () {
      $scope.range = timeSrv.timeRange();
      $scope.rangeUnparsed = timeSrv.timeRange(false);
      $scope.resolution = Math.ceil($(window).width() * ($scope.panel.span / 12));
      $scope.interval = kbn.calculateInterval($scope.range, $scope.resolution, $scope.panel.interval);
    }; 

    $scope.get_data = function() {
        //console.log("xxx get_data");
      $scope.updateTimeRange();
      delete $scope.panel.error;
      var metricsQuery = {
          range: $scope.rangeUnparsed,
          interval: $scope.interval,
          targets: [ 
              { target: $scope.panel.target1 },
              { target: $scope.panel.target2 },
          ],
          format: "json",
      };
      return $scope.datasource.query(metricsQuery)
        .then($scope.dataHandler)
        .then(null, function(err) {
            $scope.panelMeta.loading = false;
            console.log("datasource.query error:" + err.message);
            console.log(err.stack);
            //$scope.panel.error = err.message || "Graphite HTTP Request Error";  
            // we see this when one of the two graphs has no data points (e.g. no errors)
            // This may be fixed by https://github.com/graphite-project/graphite-web/pull/646
            // for now, let's try just fetching the first metric, see if that works
            //metricsQuery.targets = [ { target: $scope.panel.target1 } ];
            //return $scope.datasource.query(metricsQuery).then($scope.daeaHandler);
          });
    };

    /** this is the return value from the graphite data fetch */
    $scope.dataHandler = function(data) {
            $scope.panelMeta.loading = false;
        //console.log("xxx dataHandler gotdata " + data);
        // compute uptime from response data
        var sla = [ $scope.panel.threshold1, $scope.panel.threshold2 ];
        var response = data.data;
        var timesegments_total = 0.0;
        var timesegments_out_of_sla = 0;
        // convert the response, which is separate series, into one
        var results = {};
        for (var i in response) {
          var datapoints = response[i].datapoints;
          for (var j in datapoints) {
            var value = datapoints[j][0];
            var timestamp = datapoints[j][1];
            if (!(timestamp in results)) {
              results[timestamp] = {};
            }
            results[timestamp][i] = value;
          }
        }
        // now scan and generate uptime
        var most_recent_out_of_sla = 0;
        var most_recent_ts = 0;
        for (i in results) {
          var metric0 = parseFloat(results[i][0]);
          var target1 = parseFloat(results[i][1]);
          timesegments_total += 1;
          var out_of_sla = false;
          if (metric0 > sla[0])  {
            timesegments_out_of_sla += 1;
            out_of_sla = true;
          }
          if (target1 > sla[1]) {
            timesegments_out_of_sla += 1;
            out_of_sla = true;
          }
          if (out_of_sla && i > most_recent_out_of_sla) {
              most_recent_out_of_sla = i;
          }
          if (i > most_recent_ts ) {
              most_recent_ts = i;
          }
          //console.log("sla check",i,metric0,sla[0],eetric1,sla[1],out_of_sla);
          //console.log( results[i][0] + "=" + p95 + ":" + results[i][1] + "=" + error_percentage + ":" + out_of_sla);
        }
        var uptime = (1.0 - (timesegments_out_of_sla/timesegments_total)) * 100.0;
        // round to 2 decimals
        uptime = parseFloat(Math.round(uptime * 100) / 100).toFixed(2);
        //console.log("xxx gotdata computed uptime",timesegments_out_of_sla,"/",timesegments_total,"=",uptime);
        $scope.panel.uptime = uptime + "%";
        if ( most_recent_out_of_sla > 0 ) {
            $scope.panel.outage = "up " + $scope.toHHMMSS(most_recent_ts-most_recent_out_of_sla);
        }
        $scope.render();
      };


      // http://stackoverflow.com/questions/6312993/javascript-seconds-to-time-with-format-hhmmss
      $scope.toHHMMSS = function (seconds) {
          var days    = Math.floor(seconds / (60*60*24) )
          seconds -= days * 60*60*24;
          var hours   = Math.floor(seconds / (60*60) );
          seconds -= hours * 60*60;
          var minutes = Math.floor(seconds / 60 );
          seconds -= minutes * 60;

          if (hours   < 10) {hours   = "0"+hours;}
          if (minutes < 10) {minutes = "0"+minutes;}
          if (seconds < 10) {seconds = "0"+seconds;}
          if (days > 0)  {
              return days + "d " + hours+':'+minutes+':'+seconds;
          } else {
              return hours+':'+minutes+':'+seconds;
          }
      }


    $scope.render = function(data) {
      $scope.$emit('render', data);
    };

    panelSrv.init($scope);

  });

});

