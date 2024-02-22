require("dotenv").config();
const { Events } = require('discord.js');
const TWITTER_CHANNEL_ID = process.env.TWITTER_CHANNEL_ID;
console.log('listenForMessages.js loaded');
console.log('TWITTER_CHANNEL_ID:', TWITTER_CHANNEL_ID);
module.exports = {
    name: "listenForMessages",
    execute(client, message) {
        console.log('message received');
        if (message.channel.id === TWITTER_CHANNEL_ID) {
            console.log(`[${message.author.tag}] ${message.content}`);
          }
    },
};