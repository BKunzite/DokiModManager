use std::time::Instant;

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

        println!("Call '{}' Finished", self.name);
        println!("Log Finished With Calls: {}", self.calls.len());
        println!("Log DeltaTime: {:.3}ms", delta.as_secs_f64() * 1000.0);
        println!("// ---------- LOG START ---------- //");
        println!("START_TIME // {:?}", start);

        let mut last = start;
        for (name, time) in &self.calls {
            let since_last = time.duration_since(last).as_secs_f64() * 1000.0;
            let since_start = time.duration_since(start).as_secs_f64() * 1000.0;
            println!(
                "Call: {} after {:.3}ms ({:.3}ms since start)",
                name, since_last, since_start
            );
            last = *time;
        }

        println!(
            "// END_TIME // {:?}ms // DELTA_TIME // {:.3}ms ({:.3}s) //",
            end,
            delta.as_secs_f64() * 1000.0,
            delta.as_secs_f64()
        );

        self.calls.clear();
    }
}
