const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
require("dotenv").config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const openai = new OpenAI({
	apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
  });


async function mapTweetToPlayer(tweetText, supabase, openai) {
	const { data, error } = await supabase.from('players').select('player_id, full_name').eq('sport', 'baseball').eq('status', 'Active')
    
	try {
		const messages = [
		  {
			role: "system",
			content: `You will be provided with a tweet delimited by triple quotes, and a json array. Each object in the json array corresponds to an athlete. Your task is to return the players that are referenced in the tweet. Include a probability that this player is the correct one from 0,1. Anything over 90% should be fairly certain. If you think none of the players fit , then return an empty array. Use the following format for your output: {result: [{full_name, player_id, probability}, {full_name, player_id, probability}]}  Thank you!`,
		  },
		  { role: "user", content: `"""${tweetText} """ ${JSON.stringify(data)}` },
		];
	
		const response = await openai.chat.completions.create({
		  model: "gpt-4-turbo-preview",
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


// test the function
const tweetText = `Reliever Recon's @​TheReal_NFC Main Event RP primer was just published for our subs. Hours of research of the top 25 finishers, aggregated averages, 5-round ADP pockets, and FAAB review from 2023. Enjoy and be well ⤵️<https://www.patreon.com/posts/2024-nfbc-draft-99450744?utm_medium=clipboard_copy&utm_source=copyLink&utm_campaign=postshare_creator&utm_content=join_link>`;
mapTweetToPlayer(tweetText).then(console.log);
