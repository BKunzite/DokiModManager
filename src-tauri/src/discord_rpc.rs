use std::{sync::Mutex};
use discord_rpc_client::Client;
use std::sync::LazyLock;

static ACTIVITY: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new(String::new()));

pub fn set_activity(activity: &str) {
    if let Ok(mut current_activity) = ACTIVITY.lock() {
        *current_activity = activity.to_string();
    }
}

pub fn start() {
    let mut drpc = Client::new(0);


    drpc.on_ready(|_ctx| {
        println!("DISCORD RPC READY!");
    });

    drpc.on_error(|_ctx| {
        println!("An error occured");
    });

    drpc.start();

    loop {
        if let Err(why) = drpc.set_activity(|a| a
            .state(format!("{}",&ACTIVITY.lock().unwrap().to_string()))
            .assets(|ass| ass
                .large_image("ferris_wat")
                .large_text("wat.")
                .small_image("rusting")
                .small_text("rusting...")))
        {
            println!("Failed to set presence: {}", why);
        }
    };
}