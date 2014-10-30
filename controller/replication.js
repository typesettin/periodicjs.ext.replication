'use strict';

var Utilities = require('periodicjs.core.utilities'),
	ControllerHelper = require('periodicjs.core.controller'),
	Connection = require('ssh2'),
	fs = require('fs-extra'),
	path = require('path'),
	async = require('async'),
	CoreUtilities,
	CoreController,
	appSettings,
	mongoose,
	logger,
	replicationconffilepath,
	replicationSettings,
	uploadreplicationdir = path.resolve(process.cwd(), 'content/files/replications'),
	d = new Date(),
	defaultExportFileName = 'dbemptyreplication' + '-' + d.getUTCFullYear() + '-' + d.getUTCMonth() + '-' + d.getUTCDate() + '-' + d.getTime() + '.json';

/**
 * get the replication settings
 * @param  {Function} asyncCallBack
 * @return {Function} async callback asyncCallBack(err,results);
 */
var getReplicationData = function(replicationSettings,asyncCallBack){
	var conn = new Connection();
	conn.on('ready', function() {
	  console.log('Connection :: ready');
	  conn.exec('uptime', function(err, stream) {
	    if (err){ 
	    	asyncCallBack(err);
	    }
	    else{
		    stream.on('exit', function(code, signal) {
		      console.log('Stream :: exit :: code: ' + code + ', signal: ' + signal);
		      asyncCallBack(null,'Stream :: exit :: code: ' + code + ', signal: ' + signal);
		    }).on('close', function() {
		      console.log('Stream :: close');
		      conn.end();
		    }).on('data', function(data) {
		      console.log('STDOUT: ' + data);
		    }).stderr.on('data', function(data) {
		      console.log('STDERR: ' + data);
		    });
	    }
	  });
	}).connect(replicationSettings);
};

/**
 * get the replication settings
 * @param  {Function} asyncCallBack
 * @return {Function} async callback asyncCallBack(err,results);
 */
var getReplicationConfig = function(replicateFromEnvironment,asyncCallBack){
	fs.readJson(replicationconffilepath,function(err,confJson){
		if(err){
			asyncCallBack(err,null);
		}
		else{
			try{
				replicationSettings = confJson[replicateEnvironment];	
				if(replicationSettings.webapppath){
					replicationSettings.webapppath = require('fs').readFileSync(path.resolve(replicationSettings.webapppath));
				}			
				asyncCallBack(null,replicationSettings);
			}
			catch(e){
				asyncCallBack(e,null);
			}
		}
	});
};

/**
 * replicate periodic
 * @param  {Function} asyncCallBack
 * @return {Function} async callback asyncCallBack(err,results);
 */
var replicate_periodic = function(options,asyncCallBack){
	var environment = options.environment;

	async.waterfall([
			function(cb){
				cb(null,environment);
			},
			getReplicationConfig,
			getReplicationData
		]
		,function(err,results){
			asyncCallBack(err,results);
	});
};

/**
 * uploads replications via admin interface
 * @param  {object} req
 * @param  {object} res
 * @return {object} responds with replication page
 */
var index = function (req, res) {
	async.waterfall([
		function (cb) { 
			fs.ensureDir(path.join(process.cwd(), 'content/files/replications'),function(err){
				cb(err);
			});
		},
		function (cb) {
			CoreController.getPluginViewDefaultTemplate({
					viewname: 'p-admin/replication/index',
					themefileext: appSettings.templatefileextension,
					extname: 'periodicjs.ext.replication'
				},
				function (err, templatepath) {
					cb(err, templatepath);
				});
		},
		function (templatepath, cb) {
			fs.readdir(path.join(process.cwd(), 'content/files/replications'), function (err, files) {
				var replicationzipfiles = [];
				if(files && files.length >0){
					for (var bufi = 0; bufi < files.length; bufi++) {
						if (files[bufi].match(/.zip/gi)) {
							replicationzipfiles.push(files[bufi]);
						}
					}	
				}
				cb(err, {
					templatepath: templatepath,
					existingreplications: replicationzipfiles
				});
			});
		}
	], function (err, result) {
		CoreController.handleDocumentQueryRender({
			res: res,
			req: req,
			err: err,
			renderView: result.templatepath,
			responseData: {
				pagedata: {
					title: 'Backup & Restore',
					headerjs: ['/extensions/periodicjs.ext.replication/js/replication.min.js'],
					extensions: CoreUtilities.getAdminMenu()
				},
				periodic: {
					version: appSettings.version
				},
				existingreplications: result.existingreplications,
				user: req.user
			}
		});
	});

};

/**
 * replication controller
 * @module replicationController
 * @{@link https://github.com/typesettin/periodicjs.ext.replication}
 * @author Yaw Joseph Etse
 * @copyright Copyright (c) 2014 Typesettin. All rights reserved.
 * @license MIT
 * @requires module:async
 * @requires module:periodicjs.core.utilities
 * @requires module:periodicjs.core.controller
 * @param  {object} resources variable injection from current periodic instance with references to the active logger and mongo session
 * @return {object}           replication
 */
var controller = function (resources) {
	logger = resources.logger;
	mongoose = resources.mongoose;
	appSettings = resources.settings;
	CoreController = new ControllerHelper(resources);
	CoreUtilities = new Utilities(resources);
	replicationconffilepath  = path.join(CoreExtension.getconfigdir({
		extname: 'periodicjs.ext.replication'
	}), 'settings.json');

	return {
		index: index,
		replicate_periodic: replicate_periodic,
		// restoreBackup: restoreBackupModule.restoreBackup,
		// exportBackup: exportBackupModule.exportBackup,
	};
};

module.exports = controller;