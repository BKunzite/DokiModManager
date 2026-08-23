use std::fs::remove_file;
use std::io::Write;
use std::sync::{LazyLock, Mutex};
use std::time::Instant;
use tauri::webview::cookie::time::Timestamp;

static OUTPUT_PATH: LazyLock<Mutex<Vec<String>>> = LazyLock::new(|| Mutex::new(vec![]));
const IDENTIFIER: &str =
    "\x1b[95m\x1b[1mDoki Doki \x1b[35mMod Manager\x1b[90m\x1b[22m  \x1b[39m|\x1b[90m  ";
static LOG_FILE: LazyLock<Mutex<Option<std::fs::File>>> = LazyLock::new(|| Mutex::new(None));

pub struct SimpleLogger {
    name: String,
    start: Option<Instant>,
    calls: Vec<(String, Instant)>,
}

impl SimpleLogger {
    pub fn new(name: impl Into<String>) -> Self {
        SimpleLogger {
            name: name.into(),
            start: Some(Instant::now()),
            calls: Vec::new(),
        }
    }

    pub fn log(&mut self, call_name: impl Into<String>) {
        self.calls.push((call_name.into(), Instant::now()));
    }

    pub fn finish(&mut self) {
        let end = Instant::now();
        let start = match self.start.take() {
            Some(s) => s,
            None => {
                eprintln!("Logger '{}' finished without being started", self.name);
                return;
            }
        };

        let delta = end.duration_since(start);

        push_stamp(format!("simple_log - {}", self.name).as_str());
        stamp(format!("Log Calls: {}", self.calls.len()).as_str());
        stamp(format!("Log DeltaTime: {:.3}ms", delta.as_secs_f64() * 1000.0).as_str());
        stamp("// ---------- LOG START ---------- //");
        stamp(format!("START_TIME // {:?}", start).as_str());

        let mut last = start;
        for (name, time) in &self.calls {
            let since_last = time.duration_since(last).as_secs_f64() * 1000.0;
            let since_start = time.duration_since(start).as_secs_f64() * 1000.0;
            stamp(
                format!(
                    "Call: {} after {:.3}ms ({:.3}ms since start)",
                    name, since_last, since_start
                )
                .as_str(),
            );
            last = *time;
        }

        stamp(
            format!(
                "// END_TIME // {:?}ms // DELTA_TIME // {:.3}ms ({:.3}s) //",
                end,
                delta.as_secs_f64() * 1000.0,
                delta.as_secs_f64()
            )
            .as_str(),
        );
        pop_stamp();

        self.calls.clear();
    }
}

pub fn setup_logs() {
    if LOG_FILE.lock().unwrap().is_some() {
        return;
    }
    let current_dir = crate::get_current_dir().join("store");
    let logs = current_dir.join("logs");
    std::fs::create_dir_all(&logs).unwrap_or_else(|_| {
        println!("Failed to create logs directory!");
    });
    let logs_size = logs.read_dir().unwrap().count();
    if logs_size > 10 {
        let oldest_log = logs.read_dir().unwrap().nth(0).unwrap().unwrap();
        remove_file(oldest_log.path()).unwrap_or_else(|_| {
            println!("Failed to delete oldest log file!");
        })
    }
    let log_file_path = logs.join(format!("log_{}.txt", Timestamp::now().as_milliseconds()));
    let log_file = std::fs::File::create(&log_file_path).expect("Failed to create log file!");
    LOG_FILE.lock().unwrap().replace(log_file);
}

pub fn push_stamp(string: &str) {
    OUTPUT_PATH.lock().unwrap().push(string.to_string());
    let stack = get_stack();

    output(format!(
        "{}Stack Start: {} | Stack: {}\x1b[39m",
        IDENTIFIER,
        string,
        stack
    ), format!("Stack Start - {} | {}", string, stack));
}

pub fn pop_stamp() {
    let pop = {
        OUTPUT_PATH
            .lock()
            .unwrap()
            .pop()
            .unwrap_or_else(|| String::from("Empty Stack"))
    };
    let stack = get_stack();

    output(format!(
        "{}Stack End: {} | Stack: {}\x1b[39m",
        IDENTIFIER,
        pop,
        stack
    ),  format!("Stack End - {} | {}", pop, stack));
}

pub fn stamp(string: &str) {
    let stack = get_stack();

    output(format!(
        "{}(\x1b[36m{}\x1b[90m) => \x1b[39m{}",
        IDENTIFIER,
        stack,
        string
    ), format!("[{}] Stack - {} | {}", Timestamp::now().as_milliseconds(), stack, string));
}

fn output(formatted: String, raw: String) {
    println!("{}", formatted);

    if let Some(file) = LOG_FILE.lock().unwrap().as_mut() {
        writeln!(file, "{}", raw).unwrap();
    }
}

fn get_stack() -> String {
    let paths = { OUTPUT_PATH.lock().unwrap() };
    let mut path = String::new();

    if paths.len() == 0 {
        return String::from("Empty Stack");
    }

    for parent in paths.iter().rev() {
        path = if path.is_empty() {
            parent.to_string()
        } else {
            format!("{} -> {}", parent, path)
        }
    }

    path
}
