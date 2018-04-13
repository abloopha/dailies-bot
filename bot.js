var Discord = require('discord.io');
var logger = require('winston');
var wget = require('node-wget');
const cheerio = require('cheerio');

var http = require('http');
var fs = require('fs');

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

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

bot.on('message', function (user, userID, channelID, message, evt) {

    // Commands start with !
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd.toLowerCase()) {
            // !ping
            // case 'ping':
            // 	logger.info('Received ping! sending pong...');
            //     bot.sendMessage({
            //         to: channelID,
            //         message: 'Pong!'
            //     });
            // break;

            case 'code':
				wget('https://store.enmasse.com/closers/items?from_steam=closers.html',
					function (error, response, body) {
                        bot_message = "";

						if (error) {
							console.log('--- error:');
							console.log(error);
                            bot_message = "Sorry, something went wrong. :("
						} else {
							const $ = cheerio.load(body, {
							    normalizeWhitespace: true,
							    xmlMode: true
							});
							
                            $('div.item:has(span#free-code)').each(function(i, elem) {
                                freebie = $('h3', this).text();
                                code = $('div.code > span#free-code:has(p:not(:has(*))) > p', this).text();
                                link = $('div.code > span#free-code:has(p:has(a)) a', this).attr('href');
                                console.log(code);
                                console.log(link);
                                if(code) {
                                    bot_message += "**" + freebie + "** - " + code + "\n";
                                } else if (link) {
                                    description = $('div.item > div.description > p', this).text();
                                    bot_message += "**" +freebie + "** - " + description + "\n" + link + "\n";
                                }
                            });

                            console.log(bot_message);
						}

                        bot.sendMessage({
                            to: channelID,
                            message: bot_message
                        });
					}
				);
            	break;

            case 'help':
            	bot.sendMessage({
            		to: channelID,
            		message: 'Commands: `!code`'
            	});
            	break;

            default:
            	bot.sendMessage({
            		to: channelID,
            		message: 'Try `!help` for a list of commands.'
            	});
         }
     }
});