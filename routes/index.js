"use strict";
const express = require('express');
const router = express.Router();
const _ = require('lodash');
const vrpano = require('../modules/convert-vrpano-promise');
const sharp =  require('sharp');
const formidable = require('formidable');
const multiparty = require('multiparty');
const Promise = require('bluebird');
const fsp = require('fs-promise');
const sizeOf = require('image-size');
const baseDirectory = process.cwd();
const baseImageDir = '/resources/medias/';
const image_resize_information = [

];
const request = require("request");
const moment = require("moment");
const passport = require('passport');
const passportService = require("../config/passport");
const requireAuth = passport.authenticate('jwt', {session: false});
const requireLogin = passport.authenticate('local', {session: false});


/**
 * 일반 이미지 resizing 하는 부분
 * @param normal_images 일반 이미지의 배열
 */
const image_sizes_arr = {
    "1200" : 1200,
    "720" : 720
};

let request_func= function(url, header, body) {
    let options = {
        url: url,
        method: 'POST',
        headers: header,
        form: body
    };
    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            let info = JSON.parse(body);
        }
    }
    request(options, callback);
};
let normal_image_processing = function(normal_images, user_email, postID) {
    let result = {
	postID : postID,
        images: [ ],
        size: ["original", "mobile", "desktop"]
    };
    return new Promise(function(resolve, reject) {
        const d = new Date();
        let file_name = d.getFullYear() + ''+ d.getMonth()+ '' + d.getDate()+ '' + d.getHours() + ''+ d.getMinutes()+ '' + d.getSeconds()+ '' +d.getMilliseconds() + '' + Math.floor(Math.random() * 1000) + 1;

        return fsp.ensureDir(baseDirectory + baseImageDir + 'images/' + user_email)
                .then(fsp.ensureDir(baseDirectory + baseImageDir + 'images/' + user_email + '/original'))
                .then(fsp.ensureDir(baseDirectory + baseImageDir + 'images/' + user_email + '/desktop'))
                .then(fsp.ensureDir(baseDirectory + baseImageDir + 'images/' + user_email + '/mobile')).then(() => {

                return Promise.each(normal_images, function (image) {
                    let original_path = baseDirectory + baseImageDir+ 'images/' + user_email + '/original/' +file_name + '_' + image.name;

                    return fsp.move(image.path, original_path).then(function () {
                        let dimensions = sizeOf(original_path);
                        result["images"].push(
                            {
                                mimetype: image.type,
                                type: "NORMAL_IMAGE",
                                size: image.size,
                                file_name : file_name + '_' + image.name
                            });
			
                        if(dimensions.width > image_sizes_arr["1200"]) {
                            return sharp(original_path)
                                .resize(image_sizes_arr["1200"], parseInt(dimensions.height *  (image_sizes_arr["1200"] / dimensions.width)))
                                .toFile(baseDirectory + baseImageDir + 'images/' + user_email + '/desktop/' + file_name + '_' + image.name).then(() => {
                                    return sharp(original_path)
                                        .resize(image_sizes_arr["720"], parseInt(dimensions.height * (image_sizes_arr["720"] / dimensions.width)))
                                        .toFile(baseDirectory + baseImageDir + 'images/' + user_email + '/mobile/' + file_name + '_' + image.name);
                                });
                        }
                        else {
                            if(dimensions.width > image_sizes_arr["720"]) {
                                return sharp(original_path)
                                    .toFile(baseDirectory + baseImageDir+ 'images/' + user_email + '/desktop/' + file_name + '_' + image.name).then(() => {
                                        return sharp(original_path)
                                            .resize(image_sizes_arr["720"], parseInt(dimensions.height * (image_sizes_arr["720"] / dimensions.width)))
                                            .toFile(baseDirectory + baseImageDir + 'images/' + user_email + '/mobile/' + file_name + '_' + image.name);
                                    });
                            }
                            else {
                                return sharp(original_path)
                                    .toFile(baseDirectory + baseImageDir + 'images/' + user_email + '/desktop/' + file_name + '_' + image.name).then(() => {
                                        return sharp(original_path)
                                            .toFile(baseDirectory + baseImageDir + 'images/' + user_email + '/mobile/' + file_name + '_' + image.name);
                                    });
                                }
                            }
                        })
                    }).then(()=> {
                        resolve(result);
                    }).catch(function (err) {
                        console.log(err);
                        reject(err);
                    });
            });
        });
};

let vr_image_processing = function(vr_images, user_email, postID) {
    let vrImagePaths = [];
    let result = {
	postID: postID,
        vrImages: [ ],
        vtour: []
    };
    return new Promise(function(resolve, reject) {
        return Promise.each(vr_images, function(image) {
            const d = new Date();
            let file_name = d.getFullYear() + ''+ d.getMonth()+ '' + d.getDate()+ '' + d.getHours() + ''+ d.getMinutes()+ '' + d.getSeconds()+ '' +d.getMilliseconds() + '' + Math.floor(Math.random() * 1000) + 1;
            let original_path = baseDirectory + baseImageDir + 'vr_image/' + file_name + '_' + image.name;

            return fsp.move(image.path, original_path).then(function () {
                vrImagePaths.push(original_path);
		result["vrImages"].push(
		    {
			mimetype: image.type,
			type: "VR_IMAGE",
			size: image.size,
			file_name : file_name + '_' + image.name,
			tile_dir_name : file_name + '_' + image.name,
			thumbnail_image_name: "thumb.jpg",
			preview_image_name : "preview.jpg",
		        mobile_dir_name : "mobile"
		    });
            });
        }).then(()=> {
	    let moment_result =  moment.utc().format('YYYYMMDDHHmmssSS');
            let folderName = user_email + '/' + moment_result;
            if(vrImagePaths.length > 0) {
                result["vtour"].push({
                    type : "VTOUR",
                    file_path : moment_result,
                    file_name : "tour.xml"
                });
                return vrpano.convertVRPano(vrImagePaths, folderName).then((test) => {
				//console.log(test);
                        resolve(result);
                }).catch((err) => {
			console.log(err);
			});
            } else {
                resolve(vrImagePaths);
            }
        }).catch(function (err) {
            reject(err);
        });
    });
};


router.post('/convert/images', requireAuth, function(req, res, next) {
    let token = req.header('Authorization');
    let user_email = req.user.email;
    //console.log(token);
    //console.log(req.headers);

    //console.log(req.user.email);
    const form = new formidable.IncomingForm();
    let normal_images = [], fields = {};
    form.parse(req, function (err, fields, files) {
    }).on('field', function(field, value) {
        fields[field] =  value;
    }).on('file', function(field, file) {
        if(field=='normal_images') normal_images.push(file);
    }).on('end', function() {
        normal_image_processing(normal_images, user_email, fields["postID"]).then((result) => {
	    request_func("http://loveljhs2.iptime.org:3000/api/post/images", 
			   {
			   	"Content-Type": "application/x-www-form-urlencoded",
				"Authorization" : token
			   }, result);
            res.json(result);
        }).catch(() => {
            res.status(500);
            res.send();
            res.end();
        });
    });
});
router.post('/', function(req, res, next) {
    console.log(req.body);
    //console.log(req.header('Authorization'));

    res.json({result: true});
});
router.post('/convert/vtour', requireAuth,  function(req, res, next) {
    let token = req.header('Authorization');
    let user_email = req.user.email;
    const form = new formidable.IncomingForm();
    let vr_images = [], fields = {};
    form.parse(req, function (err, fields, files) {

    }).on('field', function(field, value) {
        fields[field] =  value;
    }).on('file', function(field, file) {
        if(field=='vr_images') vr_images.push(file);
    }).on('end', function() {
	    console.log(fields);
        vr_image_processing(vr_images, user_email, fields["postID"]).then((result) => {
            request_func("http://loveljhs2.iptime.org:3000/api/post/vtour", 
			    {
			    	"Content-Type": "application/x-www-form-urlencoded",
				"Authorization" : token
				}, result);
            res.json(result);
        }).catch((err) => {
	
		console.log(err)	
	});
    });
});

module.exports = router;
