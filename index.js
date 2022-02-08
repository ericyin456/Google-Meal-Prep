const http = require('http');
const https = require('https');
const port = 3000;
const server = http.createServer();
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');

var randomMeal;
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

function access_token_cache(access_token, token_request_time) {
    access_token.expiration = new Date(token_request_time.getTime() + (access_token.expires_in * 1000));
    fs.writeFile("./cache/authentication_res.json", JSON.stringify(access_token), () => { console.log("Token got cache") });
}

server.on("request", connection_handler);

function connection_handler(req, res) {
    var cal_id;

    console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);

    if (req.url === '/') {
        const main = fs.createReadStream('html/main.html');
        res.writeHead(302, { 'Content-Type': 'text/html' });
        main.pipe(res);
    }
    else if ( req.url.startsWith("/image/food.jpg")){
        const test = fs.createReadStream('image/food.jpg');
        res.writeHead(200, {'Content-Type': 'image/jpeg'});
        test.pipe(res);
    }
    else if (req.url.startsWith("/search")) {
        
        var paramsUrl = new URL("localhost:3000" + req.url);
        var category = paramsUrl.searchParams.get("categories");
        var option = {
            hostname: 'themealdb.com',
            path: "/api/json/v1/1/filter.php?c=" + category
        };

        //------------------------------------------------------------------------mealdb get Request
        https.get(option, (mealRes) => {

            var data;

            mealRes.on('data', (chunk) => {
                if (!data) {
                    data = chunk;
                }
                else {
                    data = data + chunk;
                }
            });

            mealRes.on('end', function () {
                var result = JSON.parse(data).meals;

                //Grab one of the meals available
                randomMeal = result[getRandomInt(result.length)];

                console.log("meal is:" + JSON.stringify(randomMeal.strMeal))
                //-------------------------------------------------------------------------connect to google

                res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar&client_id=8324222669-u2r9ke0alkgdc0v7p3c1lbtfe56thpjq.apps.googleusercontent.com&redirect_uri=http://localhost:3000&response_type=code' });
                res.end();

                //------------------------------------------------------------------------------------------
            })

        }).on('error', (e) => {
            console.error("the error is : " + e);
        });
        //------------------------------------------------------------
    }
    else if (req.url.startsWith("/?")) {

        const token_request_time = new Date();

        const token_cache_file = "./cache/authentication_res.json";
        let cache_valid = false;

        if (fs.existsSync(token_cache_file)) {
            cache_token_object = require(token_cache_file);
            if (new Date(cache_token_object.expiration > Date.now())) {
                cache_valid = true;
            }
        }
        if (cache_valid) {
            console.log("Cache_login");

                var access_token = cache_token_object.access_token;

                const calendarOptions = {
                    hostname: 'www.googleapis.com',
                    path: '/calendar/v3/users/me/calendarList',
                    headers: {
                        'Authorization': 'Bearer ' + access_token,
                        'Content-Type': 'application/json'
                    }
                };

                https.get(calendarOptions, (calResponse) => {

                    let calResponse_body = [];

                    calResponse.on('data', (chunk) => {
                        calResponse_body.push(chunk);
                    }).on('end', () => {
                        calResponse_body = Buffer.concat(calResponse_body).toString();
                        // at this point, `calResponse_body` has the entire request calResponse_body stored in it as a string
                        //grabs the first calander id from the google user

                        cal_id = JSON.parse(calResponse_body).items[0].id.toString();
                    });
                    
                    calResponse.on('end', function () {

                        //use the info from mealdb to create a google event
                        var postPath = `/calendar/v3/calendars/` + cal_id + `/events`

                        var postEventOptions = {
                            host: 'www.googleapis.com',
                            path: encodeURI(postPath),
                            method: 'POST',
                            headers: {
                                'Authorization': 'Bearer ' + access_token,
                                'Content-Type': 'application/json'
                            }
                        }

                        //Make Meal for Today
                        const get_date = new Date();

                        var googleEventData = {
                            "end": {
                                "dateTime": get_date
                            },
                            "start": {
                                "dateTime": get_date
                            },
                            "summary": JSON.stringify(randomMeal.strMeal)
                        }
                        const calEventRequest = https.request(postEventOptions, (eventRes) => {
                            let eventRes_body = [];
                            eventRes.on('data', (dataRes) => {
                                eventRes_body.push(dataRes)
                            }).on('end', () => {
                                eventRes_body = Buffer.concat(eventRes_body).toString();
                            })
                        })

                        calEventRequest.on('error', (err) => {
                            console.log('WE FOUND ERROR' + err)
                        })

                        calEventRequest.write(JSON.stringify(googleEventData));

                        calEventRequest.end();

                        res.end();

                    });
                }).on('error', (err) => console.log("theres an error with calander!" + err));
            res.end("Copy and paste this link to access google calendar: https://www.google.com/calendar/event?eid=aWpma3RpdXBia3Vrc2JxbG8yOGFva2szbmcgZXlpbjEwMEBxYy5jdW55LmVkdQ");
        }
        else {
            console.log("Request Login");

            var googleParamsUrl = new URL("localhost:3000" + req.url);
            var code = googleParamsUrl.searchParams.get("code");

            var googleData = {
                client_id: "8324222669-u2r9ke0alkgdc0v7p3c1lbtfe56thpjq.apps.googleusercontent.com",
                client_secret: "HrY-UbmEoNEPVIX27C6dLRWg",
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: 'http://localhost:3000'
            };

            var postOptions = {
                host: 'oauth2.googleapis.com',
                path: '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            //-----------------------------------------------------------------------------request

            const tokenRequest = https.request(postOptions, (tokenResponse) => {

                tokenResponse.on('data', (data) => {

                    var token_object = JSON.parse(data);
                    var access_token = JSON.parse(data).access_token;
                    
                    access_token_cache(token_object, token_request_time);

                    const calendarOptions = {
                        hostname: 'www.googleapis.com',
                        path: '/calendar/v3/users/me/calendarList',
                        headers: {
                            'Authorization': 'Bearer ' + access_token,
                            'Content-Type': 'application/json'
                        }
                    };

                    https.get(calendarOptions, (calResponse) => {
                        let calResponse_body = [];
                        calResponse.on('data', (chunk) => {
                            calResponse_body.push(chunk);
                        }).on('end', () => {
                            calResponse_body = Buffer.concat(calResponse_body).toString();
                            // at this point, `calResponse_body` has the entire request calResponse_body stored in it as a string
                            //grabs the first calander id from the google user
                            cal_id = JSON.parse(calResponse_body).items[0].id.toString();
                        });

                        calResponse.on('end', function () {

                            //use the info from mealdb to create a google event
                            var postPath = `/calendar/v3/calendars/` + cal_id + `/events`

                            var postEventOptions = {
                                host: 'www.googleapis.com',
                                path: encodeURI(postPath),
                                method: 'POST',
                                headers: {
                                    'Authorization': 'Bearer ' + access_token,
                                    'Content-Type': 'application/json'
                                }
                            }

                            //get change the date/time
                            const get_date = new Date();

                            var googleEventData = {
                                "end": {
                                    "dateTime": get_date
                                },
                                "start": {
                                    "dateTime": get_date
                                },
                                "summary": JSON.stringify(randomMeal.strMeal)
                            }
                            const calEventRequest = https.request(postEventOptions, (eventRes) => {
                                let eventRes_body = [];
                                eventRes.on('data', (dataRes) => {
                                    eventRes_body.push(dataRes)
                                }).on('end', () => {
                                    eventRes_body = Buffer.concat(eventRes_body).toString();
                                })
                            })

                            calEventRequest.on('error', (err) => {
                                console.log('WE FOUND ERROR' + err)
                            })

                            calEventRequest.write(JSON.stringify(googleEventData));

                            calEventRequest.end();
                            res.end();

                        });
                    }).on('error', (err) => console.log("theres an error with calander!" + err))
                });
            });

            tokenRequest.on('error', (err) => {
                console.log('WE FOUND ERROR' + err)
            })

            tokenRequest.write(JSON.stringify(googleData));

            tokenRequest.end();
            res.end("Copy and paste this link to access google calendar: https://www.google.com/calendar/event?eid=aWpma3RpdXBia3Vrc2JxbG8yOGFva2szbmcgZXlpbjEwMEBxYy5jdW55LmVkdQ");
        }
    }
    else {
        res.end("404 Not Found");
    }
}

server.on("listening", listening_handler);

function listening_handler() {
    console.log(`Now Listening on Port ${port}`);
}

server.listen(port);
