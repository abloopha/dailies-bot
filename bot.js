var Discord = require('discord.io');
var logger = require('winston');
var wget = require('node-wget');
const cheerio = require('cheerio');

var http = require('http');
var fs = require('fs');

// For job scheduling
var schedule = require('node-schedule');

// For DB
var mongo = require('mongodb');

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
	token: process.env.BOT_TOKEN,
   	autorun: true
});

var job = NaN;
var reconnect = false;

var MongoClient = require('mongodb').MongoClient;

// var uri = "mongodb://localhost:27017/";
var uri = process.env.MONGODB_URI;
var dbName = process.env.DB_NAME;

/* ------------------------------------------------------------
 * FUNCTIONS
 * ------------------------------------------------------------*/

function sendMessage(channelID, message) {
    console.log("Sending message: " + message + " to channel: " + channelID);
    if(bot) {
        bot.sendMessage({
            to: channelID,
            message: message
        });
    }
}

function cancelJob() {
    if(job) {
        job.cancel();
        job = NaN;
    }
}

function scheduleJob() {
    if(job) {
        console.log("Job is already running...");
        return;
    }

    // Second (0-59) | Min (0-59) | Hour (0-23) | Day of Month (1-31) | Month (1-12) | Day of Week (0-7, 0 or 7 = Sunday)
    var rule = new schedule.RecurrenceRule();

    // Run every minute:
    // rule.minute = new schedule.Range(0, 59);

    // Run job at 11:30AM (PDT) => 18:30PM (UTC)
    rule.minute = 30;
    rule.hour = 18;

    var job = schedule.scheduleJob(rule, function(fireDate){
        console.log("Job fired: " + fireDate);

        MongoClient.connect(uri, function(err, db) {
            if (err) {
                console.log("DB ERROR executing job: " + err);
                return;
            }

            var dbo = db.db(dbName);

            dbo.collection("channels").find({}).toArray(function(err, result) {
                if (err) {
                    console.log("DB ERROR executing job: " + err);
                    return;
                }

                if(result.length == 0) {
                    console.log("No subscribed channels... Cancelling job");
                    cancelJob();
                    db.close();
                    return;
                }

                for (var i = result.length - 1; i >= 0; i--) {
                    channel = result[i].channel_id;
                    console.log("Sending code to channel id: " + channel);
                    sendCode(channel);
                }
                
                db.close();
              });
        });

        if(job) console.log('Next job will be run at: ' + job.nextInvocation());
    });

    if(job) console.log('(NEW) job will be run at: ' + job.nextInvocation());
}

function sendCode(channelID) {
    wget('https://store.enmasse.com/closers/items?from_steam=closers.html',
        function (error, response, body) {
            if (error) {
                console.log('--- error:');
                console.log(error);
                sendMessage(channelID, "Sorry, something went wrong. :(");
            } else {
                var bot_message = "";

                const $ = cheerio.load(body, {
                    normalizeWhitespace: true,
                    xmlMode: true
                });
                
                $('div.item:has(span#free-code)').each(function(i, elem) {
                    freebie = $('h3', this).text();
                    var code = $('div.code > span#free-code:has(p:not(:has(*))) > p', this).text();
                    var link = $('div.code > span#free-code:has(p:has(a)) a', this).attr('href');
                    console.log(code);
                    console.log(link);
                    if(code) {
                        bot_message += "**" + freebie + "** - " + code + "\n";
                    } else if (link) {
                        var description = $('div.item > div.description > p', this).text();
                        bot_message += "**" + freebie + "** - " + description + "\n" + link + "\n";
                    }
                });

                sendMessage(channelID, bot_message);
            }
        }
    );
}


/* ------------------------------------------------------------
 * BOT
 * ------------------------------------------------------------*/


bot.on('ready', function (evt) {
    if(reconnect) {
    	console.log('Successful Reconnect!');
    	reconnect = false;
    } else {
    	logger.info('Connected - Logged in as: ');
    	logger.info(bot.username + ' - (' + bot.id + ')');
    }

    scheduleJob();
});

bot.on('disconnect', function (errMsg, code) {
    console.log('Disconnected |' + code + ':' + errMsg);
    if(code == 1000 && !reconnect) {
    	console.log('Attempting reconnect...');
    	reconnect = true;
    	bot.connect();
    } else {
    	console.log('Cancelling job.');
    	cancelJob();
    	reconnect = false;
	}
})

bot.on('message', function (user, userID, channelID, message, evt) {

    // Commands start with !
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
        var bot_message = '';

        args = args.splice(1);
        switch(cmd.toLowerCase()) {
            case 'code':
                sendCode(channelID);
            break;

            case 'subscribe':
                MongoClient.connect(uri, function(err, db) {
                    if (err) {
                        console.log("DB ERROR on subscribe: " + err);
                        sendMessage(channelID, "Try again later.");
                        return;
                    }
                    var dbo = db.db(dbName);
                    var myobj = { channel_id: channelID };

                    dbo.collection("channels").findOne(myobj, function(err, result) {
                        if (err) {
                            console.log("DB ERROR on subscribe.findOne: " + err);
                            sendMessage(channelID, "Try again later.");
                            db.close();
                            return;
                        }

                        if (result) {                               // Channel already subscribed
                            console.log("Found: " + result.channel_id);
                            sendMessage(channelID, "Already subscribed.");
                        } else {                                    // Subscribe channel
                            dbo.collection("channels").insertOne(myobj, function(err, res) {
                                if (err) {
                                    console.log("DB ERROR on subscribe.insertOne: " + err);
                                    sendMessage(channelID, "Try again later.");
                                    db.close();
                                    return;
                                }
                                console.log("1 document inserted - " + JSON.stringify(myobj));
                                sendMessage(channelID, "Subscribed! Today's dailies are:");
                                sendCode(channelID);
                            });
                        }
                        
                        db.close();
                    });
                });
                break;

            case 'unsubscribe':
                MongoClient.connect(uri, function(err, db) {
                    if (err) {
                        console.log("DB ERROR unsubscribe: " + err);
                        sendMessage(channelID, "Try again later.");
                        return;
                    }
                    var dbo = db.db(dbName);
                    var myobj = { channel_id: channelID };

                    dbo.collection("channels").findOne(myobj, function(err, result) {
                        if (err) {
                            console.log("DB ERROR unsubscribe.findOne: " + err);
                            sendMessage(channelID, "Try again later.");
                            db.close();
                            return;
                        }

                        if (result) {                                   // Unsubscribe channel
                            console.log("Found: " + result.name);

                            dbo.collection("channels").deleteOne(myobj, function(err, res) {

                                if (err) {
                                    console.log("DB ERROR unsubscribe.deleteOne: " + err);
                                    sendMessage(channelID, "Try again later.");
                                    db.close();
                                    return;
                                }

                                console.log("1 document deleted - " + JSON.stringify(myobj));
                                sendMessage(channelID, "Unsubcribed!");
                            });

                        } else {                                        // Channel not subscribed
                            sendMessage(channelID, "Already unsubscribed.");
                        }
                        
                        db.close();
                    });
                });
                break;

            case 'help':
                sendMessage(channelID, 'Commands: `!code` `!subscribe` `!unsubscribe`');
                break;

            default:
                // sendMessage(channelID, 'Try `!help` for a list of commands.')''
         }
     }
});