require("dotenv").config();
const Discord = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const fs = require("fs");
const date = new Date();
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TWITTER_CHANNEL_ID = process.env.TWITTER_CHANNEL_ID;
const { GatewayIntentBits, Partials } = require("discord.js");
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const client = new Discord.Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.GuildMember],
});

const openai = new OpenAI({
	apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
  });





async function mapTweetToPlayer(tweetText, supabase, openai) {
	const { data, error } = await supabase.from('players').select('player_id, full_name').eq('sport', 'football').eq('status', 'Active')
    
	try {
		const messages = [
		  {
			role: "system",
			content: `You will be provided with a tweet delimited by triple quotes, and a json array. Each object in the json array corresponds to an athlete. 
			   Your task is to return the players that are referenced in the tweet. Include a probability that this player is the correct one from 0,1 and a useful score that is if this information is useful from 0,1.
			   Anything over 90% should be fairly certain. If you think none of the players fit OR if the tweet is promotional and doesn't provide any worthwhile information, 
      then return an empty array. Use the following format for your output: {result: [{full_name, player_id, probability, useful}, {full_name, player_id, probability, useful}]}  Thank you!`,
		  },
		  { role: "user", content: `"""${tweetText} """ ${JSON.stringify(data)}` },
		];
	
		const response = await openai.chat.completions.create({
		  model: "gpt-4.1-mini",
		  response_format: { type: "json_object" },
		  messages: messages,
		});
	
		const llm_output = response.choices[0].message.content;
	
		const summary = JSON.parse(llm_output);
		const result = summary.result;
	
		return result;
	  } catch (error) {
		console.error("Error summarizing player info:", error);
	  }
}


client.slashcommands = new Discord.Collection();
let commands = [];
const slashFiles = fs
	.readdirSync("./slash")
	.filter((file) => file.endsWith(".js"));
for (const file of slashFiles) {
	const slashcmd = require(`./slash/${file}`);
	client.slashcommands.set(slashcmd.data.name, slashcmd);
	commands.push(slashcmd.data.toJSON());
}
const eventFiles = fs
	.readdirSync("./events")
	.filter((file) => file.endsWith(".js"));
for (const file of eventFiles) {
	const event = require(`./events/${file}`);

	if (event.once) {
		client.once(event.name, (...args) =>
			event.execute(...args, client)
		);
	} else {
		client.on(event.name, (...args) =>
			event.execute(...args, client)
		);
	}
}

client.on('messageCreate', async message => {
	console.log('message event');
	// Check if the message is from the desired channel
	if (message.channel.id === TWITTER_CHANNEL_ID) {
		
		console.log(`[${message.author.tag}] ${message.content}`);

		// Regular expression patterns
		const urlRegex = /https?:\/\/twitter\.com\/[^\s]*/g;
		const twitterUsernameRegex = /twitter\.com\/([^\/]+)/;
		// Regular expression pattern to extract the ID slug from the Twitter URL
		const idSlugRegex = /\/status\/(\d+)/;

		const twitterAuthorName = message.author.tag;
		//stringSplit author on ' • '
		const authorNameProcessed = twitterAuthorName.split(' • ')[0];

		// Extract text
		const text = message.content.split('https://twitter.com/')[0].trim();

		// Extract URL
		const urlMatch = message.content.match(urlRegex);
		const url = urlMatch ? urlMatch[0] : null;

		// Extract username from URL
		const usernameMatch = url.match(twitterUsernameRegex);
		const username = usernameMatch ? usernameMatch[1] : null;

		// Extract ID slug from URL
		const idSlugMatch = url.match(idSlugRegex);
		const idSlug = idSlugMatch ? idSlugMatch[1] : null;
		console.log("Text:", text);
		console.log("URL:", url);
		console.log("Twitter Username:", username);
		console.log("ID Slug:", idSlug);

		var ingest_author = username
		if(authorNameProcessed != '• TweetShift#0000'){
			ingest_author = authorNameProcessed
		}

		
		// Call the function to map the tweet to a player
		const result = await mapTweetToPlayer(text, supabase, openai);

		if (result.length != 0) {
			// For each object in the result array, insert the message into the 'takes' table in Supabase
			for (const player of result) {
				const { data: takes_data, error: takes_error } = await supabase.from('content_player_takes').insert([
					{
						content_id: 'twitter-' + username + '-' + idSlug,
						publication_name: 'twitter.com/' + username,
						content_title: text,
						published: new Date(),
						parsed_link: url,
						summary: text,
						thumbnail_url: null,
						player_id: player.player_id,
						player_name: player.full_name,
						return_obj: player,
						author: ingest_author
					}
				]);

		}

			// // Insert the message into the 'takes' table in Supabase
			const { data, error } = await supabase.from('content').insert([
				{
					content_id: 'twitter-' + username + '-' + idSlug,
					publication_name: 'twitter.com/' + username,
					content_title: text,
					published: new Date(),
					parsed_link: url,
					summary: text,
					thumbnail_url: null,
					content_type: 'tweet',
					platform_id: idSlug,
					author: ingest_author,
					is_parsed: true
				}
			]);

			if (error) {
				console.error('Error inserting message into Supabase:', error.message);
			} else {
				console.log('Message inserted into Supabase successfully:', data);
			}
		}

		
		// // Insert the message into the 'takes' table in Supabase
		// const { data, error } = await supabase.from('content').insert([
		// 	{ 
		// 		content_id: 'twitter-'+ username + '-' + idSlug,
		// 		publication_name: 'Twitter.com/' + username,
		// 		content_title: text,
		// 		published: new Date(),
		// 		parsed_link: url,
		// 		summary: text,
		// 		thumbnail_url: null,
		// 		content_type: 'tweet',
		// 		platform_id: idSlug,
		// 		author: ingest_author
		// 	 }
		// ]);


		
		// if (error) {
		// 	console.error('Error inserting message into Supabase:', error.message);
		// } else {
		// 	console.log('Message inserted into Supabase successfully:', data);
		// }
	}
});



(async () => {
	const rest = new REST({ version: "10" }).setToken(TOKEN);
	console.log("Started refreshing application (/) commands.");
	await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
		body: commands,
	})
		.then(() => {
			console.log("↳ Successfully reloaded application (/) commands.");
			console.log(date.toUTCString());
		})
		.catch((err) => {
			if (err) {
				console.log(err);
				console.log(err.requestBody.json)
				process.exit(1);
			}
		});

	await client.login(TOKEN).then(() => {
		console.log("Bot Started Successfully.");
	});
})();
