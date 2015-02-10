var utility = require('../utility');
var domain = require('domain');
var queueReq = utility.queueReq;
var multiparty = require('multiparty');
var express = require('express');
var upload = express.Router();
var Recaptcha = require('recaptcha').Recaptcha;
var rc_public = process.env.RECAPTCHA_PUBLIC_KEY;
var rc_secret = process.env.RECAPTCHA_SECRET_KEY;
var recaptcha = new Recaptcha(rc_public, rc_secret);
upload.get("/", function(req, res) {
    res.render("upload", {
        recaptcha_form: recaptcha.toHTML(),
    });
});
upload.post("/", function(req, res) {
    if (req.session.captcha_verified || process.env.NODE_ENV === "test") {
        req.session.captcha_verified = false; //Set back to false
        var form = new multiparty.Form();
        var match_id;
        var parser;
        var error;
        var d = domain.create();
        d.on('error', function(err) {
            if (!error) {
                error = err;
                if (parser) {
                    parser.kill();
                }
                close(error);
            }
        });
        d.run(function() {
            form.on('error', function(err) {
                throw err;
            });
            form.on('field', function(name, value) {
                console.log('got field named ' + name);
                //queue for api details, redirect
                if (name === "match_id") {
                    match_id = Number(value);
                    queueReq("api_details", {
                        match_id: match_id,
                        request: true,
                        priority: "high"
                    }, close);
                }
            });
            form.on('part', function(part) {
                if (part.filename) {
                    console.log('got file named ' + part.name);
                    //parse to determine match_id, queue for api details, redirect
                    parser = utility.runParse(function(err, output) {
                        if (err) {
                            throw err;
                        }
                        match_id = output.match_id;
                        queueReq("api_details", {
                            match_id: match_id,
                            upload: true,
                            parsed_data: output,
                            priority: "high"
                        }, close);
                    });
                    part.pipe(parser.stdin);
                }
            });
            form.parse(req);
        });
    }

    function close(err, job) {
        if (err) {
            return res.render("upload", {
                error: err,
                recaptcha_form: recaptcha.toHTML(),
            });
        }
        else if (job) {
            job.on('complete', function(result) {
                if (result) {
                    return res.render("upload", {
                        error: JSON.stringify(result),
                        recaptcha_form: recaptcha.toHTML(),
                    });
                }
                else {
                    return res.redirect("/matches/" + match_id);
                }
            });
        }
        else {
            res.redirect("/matches/" + match_id);
        }
    }
});
module.exports = upload;