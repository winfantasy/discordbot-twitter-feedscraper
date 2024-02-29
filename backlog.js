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


async function fixBacklogTweets() {
    // iterate through all the tweets and map them to players

    // get tweets from the content table in the database and map them to players
    const { data: tweets, error } = await supabase.from('content').select('*').eq('content_type', 'tweet').eq('is_parsed', false);

    for (const tweet of tweets) {
        console.log("Tweet: ", tweet.summary)
        const tweetText = tweet.summary;
        const result = await mapTweetToPlayer(tweetText, supabase, openai);
        console.log("Players: ", result);


        if (result.length != 0) {
            // For each object in the result array, insert the message into the 'takes' table in Supabase
            for (const player of result) {
                const { data: takes_data, error: takes_error } = await supabase.from('content_player_takes').insert([
                    {
                        content_id: tweet.content_id,
                        publication_name: tweet.publication_name,
                        content_title: tweet.content_title,
                        published: tweet.published,
                        parsed_link: tweet.parsed_link,
                        summary: tweet.summary,
                        thumbnail_url: null,
                        player_id: player.player_id,
                        player_name: player.full_name,
                        return_obj: player,
                        author: tweet.author
                    }
                ]);

            }


        }
        // // Insert the message into the 'takes' table in Supabase
        const { data, error } = await supabase.from('content').upsert([
            {
                content_id: tweet.content_id,
                is_parsed: true,
            }
        ]);



        if (error) {
            console.error('Error inserting message into Supabase:', error.message);
        } else {
            console.log('Message inserted into Supabase successfully:', data);
        }
    }
}

fixBacklogTweets()