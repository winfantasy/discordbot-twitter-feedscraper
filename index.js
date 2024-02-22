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
		const urlRegex = /(https?:\/\/[^\s]+)/;
		const twitterUsernameRegex = /twitter\.com\/([^\/]+)/;
		// Regular expression pattern to extract the ID slug from the Twitter URL
		const idSlugRegex = /\/status\/(\d+)/;



		// Extract text
		const text = message.content.split(urlRegex)[0].trim();

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

		// // Insert the message into the 'takes' table in Supabase
		const { data, error } = await supabase.from('content').insert([
			{ 
				content_id: 'twitter-'+ username + '-' + idSlug,
				publication_name: 'Twitter',
				content_title: text,
				published: new Date(),
				parsed_link: url,
				summary: text,
				thumbnail_url: null,
				content_type: 'tweet',
				platform_id: idSlug,
				author: username
			 }
		]);

		if (error) {
			console.error('Error inserting message into Supabase:', error.message);
		} else {
			console.log('Message inserted into Supabase successfully:', data);
		}
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