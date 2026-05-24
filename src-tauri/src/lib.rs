use tauri_plugin_sql::{Migration, MigrationKind};
use std::path::Path;
use std::fs;

const DB_URL: &str = "sqlite:/home/adminxens/Sentinel/events.db";
const NOTES_DIR: &str = "/home/adminxens/Sentinel/notes";
const EXPORT_DIR: &str = "/home/adminxens/Sentinel/export";

const MIGRATION_001: &str = "
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  context_json TEXT,
  source_device TEXT NOT NULL,
  source_event_id TEXT,
  related_node_id INTEGER,
  rule_id INTEGER,
  parent_event_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source ON events(source_device, source_event_id)
  WHERE source_event_id IS NOT NULL;
";

#[tauri::command]
fn read_daily_note(date: String) -> Result<String, String> {
    let path = Path::new(NOTES_DIR).join(format!("{}.md", date));
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn write_daily_note(date: String, content: String) -> Result<(), String> {
    let dir = Path::new(NOTES_DIR);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp_path = dir.join(format!("{}.md.tmp", date));
    let path = dir.join(format!("{}.md", date));
    fs::write(&tmp_path, &content).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Writes the pre-formatted export content to ~/Sentinel/export/{date}.md and .json.
/// The frontend queries the DB and formats the content; this command only handles I/O.
#[tauri::command]
fn write_export(date: String, md_content: String, json_content: String) -> Result<serde_json::Value, String> {
    // Guard: date must be YYYY-MM-DD (10 chars, digits + hyphens only) — prevent path traversal.
    if date.len() != 10 || !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err(format!("invalid date '{}': expected YYYY-MM-DD", date));
    }

    let dir = Path::new(EXPORT_DIR);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let md_path = dir.join(format!("{}.md", date));
    let json_path = dir.join(format!("{}.json", date));
    let md_tmp = dir.join(format!("{}.md.tmp", date));
    let json_tmp = dir.join(format!("{}.json.tmp", date));

    // Write both tmp files before committing either rename.
    // On any write failure: clean up both tmps and return — no partial commit.
    if let Err(e) = fs::write(&md_tmp, &md_content) {
        let _ = fs::remove_file(&md_tmp);
        return Err(e.to_string());
    }
    if let Err(e) = fs::write(&json_tmp, &json_content) {
        let _ = fs::remove_file(&md_tmp);
        let _ = fs::remove_file(&json_tmp);
        return Err(e.to_string());
    }

    // Rename both; on rename failure clean up orphaned tmps.
    if let Err(e) = fs::rename(&md_tmp, &md_path) {
        let _ = fs::remove_file(&md_tmp);
        let _ = fs::remove_file(&json_tmp);
        return Err(e.to_string());
    }
    if let Err(e) = fs::rename(&json_tmp, &json_path) {
        let _ = fs::remove_file(&json_tmp);
        return Err(e.to_string());
    }

    Ok(serde_json::json!({
        "md_path": md_path.to_string_lossy(),
        "json_path": json_path.to_string_lossy()
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create events table",
        sql: MIGRATION_001,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_daily_note, write_daily_note, write_export])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
