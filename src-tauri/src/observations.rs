use crate::monitor::{CounterCheckpoint, CounterDelta, CounterObservation, counter_delta};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const DATABASE_NAME: &str = "observations.sqlite3";
const SCHEMA_VERSION: i64 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SampleStatus {
    Measured,
    Partial,
    Disconnected,
    Missing,
}

impl SampleStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Measured => "measured",
            Self::Partial => "partial",
            Self::Disconnected => "disconnected",
            Self::Missing => "missing",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "measured" => Ok(Self::Measured),
            "partial" => Ok(Self::Partial),
            "disconnected" => Ok(Self::Disconnected),
            "missing" => Ok(Self::Missing),
            _ => Err(format!("Unknown observation status: {value}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationSample {
    pub timestamp_ms: i64,
    pub network_key: Option<String>,
    pub network_label: Option<String>,
    pub network_kind: Option<String>,
    pub session_id: Option<String>,
    pub access_point_fingerprint: Option<String>,
    pub gateway_ms: Option<i64>,
    pub internet_ms: Option<i64>,
    pub jitter_ms: Option<f64>,
    pub signal_dbm: Option<i32>,
    pub status: SampleStatus,
    pub missing_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationGap {
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub reason: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetentionPolicy {
    pub days: u32,
    pub sample_row_cap: u64,
    pub usage_cycle_cap: u64,
}

impl RetentionPolicy {
    pub fn validate(self) -> Result<Self, String> {
        if !(1..=365).contains(&self.days) {
            return Err("History retention must be between 1 and 365 days".into());
        }
        if !(100..=5_000_000).contains(&self.sample_row_cap) {
            return Err("History sample limit is outside the supported range".into());
        }
        if !(1..=10_000).contains(&self.usage_cycle_cap) {
            return Err("Usage cycle limit is outside the supported range".into());
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageTotal {
    pub network_key: String,
    pub network_label: String,
    pub cycle_start_ms: i64,
    pub received_bytes: u64,
    pub sent_bytes: u64,
    pub limit_bytes: Option<u64>,
    pub warning_level: i32,
    pub billing_cycle_day: u8,
    pub counter_reset_count: u64,
    pub adapter_change_count: u64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageUpdate {
    pub delta: CounterDelta,
    pub total: UsageTotal,
    pub warning_triggered: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageLimit {
    pub network_key: String,
    pub limit_bytes: Option<u64>,
    pub billing_cycle_day: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertRecord {
    pub id: i64,
    pub timestamp_ms: i64,
    pub network_key: String,
    pub category: String,
    pub message: String,
    pub dismissed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsEvidence {
    pub timestamp_ms: i64,
    pub network_key: String,
    pub current_name: String,
    pub current_latency_ms: Option<i64>,
    pub candidate_name: String,
    pub candidate_latency_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationBucket {
    pub start_ms: i64,
    pub end_ms: i64,
    pub sample_count: u64,
    pub measured_count: u64,
    pub missing_count: u64,
    pub disconnected_count: u64,
    pub drop_count: u64,
    pub gateway_average_ms: Option<f64>,
    pub internet_average_ms: Option<f64>,
    pub jitter_average_ms: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct ObservationDb {
    path: PathBuf,
    access: Arc<Mutex<()>>,
}

impl ObservationDb {
    pub fn open(directory: impl AsRef<Path>) -> Result<Self, String> {
        fs::create_dir_all(directory.as_ref())
            .map_err(|error| format!("Cannot create observation storage: {error}"))?;
        let database = Self {
            path: directory.as_ref().join(DATABASE_NAME),
            access: Arc::new(Mutex::new(())),
        };
        database.with_connection(|_| Ok(()))?;
        Ok(database)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn connect(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.path)
            .map_err(|error| format!("Cannot open local connection history: {error}"))?;
        connection
            .busy_timeout(std::time::Duration::from_secs(3))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA synchronous=NORMAL;
                 PRAGMA foreign_keys=ON;",
            )
            .map_err(|error| format!("Cannot configure local connection history: {error}"))?;
        Self::migrate(&connection)?;
        #[cfg(unix)]
        if self.path.exists() {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.path, fs::Permissions::from_mode(0o600))
                .map_err(|error| format!("Cannot protect local connection history: {error}"))?;
        }
        Ok(connection)
    }

    fn migrate(connection: &Connection) -> Result<(), String> {
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if version > SCHEMA_VERSION {
            return Err("Connection history was created by a newer NetMask version".into());
        }
        if version == 0 {
            connection
                .execute_batch(
                    "BEGIN IMMEDIATE;
                     CREATE TABLE IF NOT EXISTS network_catalog (
                       network_key TEXT PRIMARY KEY,
                       label TEXT NOT NULL,
                       kind TEXT NOT NULL,
                       first_seen_ms INTEGER NOT NULL,
                       last_seen_ms INTEGER NOT NULL
                     );
                     CREATE TABLE IF NOT EXISTS samples (
                       id INTEGER PRIMARY KEY,
                       timestamp_ms INTEGER NOT NULL,
                       network_key TEXT,
                       network_label TEXT,
                       network_kind TEXT,
                       session_id TEXT,
                       access_point_fingerprint TEXT,
                       gateway_ms INTEGER,
                       internet_ms INTEGER,
                       jitter_ms REAL,
                       signal_dbm INTEGER,
                       status TEXT NOT NULL CHECK(status IN ('measured','partial','disconnected','missing')),
                       missing_reason TEXT
                     );
                     CREATE INDEX IF NOT EXISTS samples_time ON samples(timestamp_ms);
                     CREATE INDEX IF NOT EXISTS samples_network_time ON samples(network_key, timestamp_ms);
                     CREATE TABLE IF NOT EXISTS gaps (
                       id INTEGER PRIMARY KEY,
                       start_ms INTEGER NOT NULL,
                       end_ms INTEGER,
                       reason TEXT NOT NULL
                     );
                     CREATE INDEX IF NOT EXISTS gaps_time ON gaps(start_ms);
                     CREATE TABLE IF NOT EXISTS usage_totals (
                       network_key TEXT NOT NULL,
                       network_label TEXT NOT NULL,
                       cycle_start_ms INTEGER NOT NULL,
                       received_bytes INTEGER NOT NULL,
                       sent_bytes INTEGER NOT NULL,
                       limit_bytes INTEGER,
                       warning_level INTEGER NOT NULL DEFAULT 0,
                       counter_reset_count INTEGER NOT NULL DEFAULT 0,
                       adapter_change_count INTEGER NOT NULL DEFAULT 0,
                       updated_at_ms INTEGER NOT NULL,
                       PRIMARY KEY(network_key, cycle_start_ms)
                     );
                     CREATE TABLE IF NOT EXISTS usage_checkpoint (
                       singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                       boot_id TEXT NOT NULL,
                       network_key TEXT NOT NULL,
                       interface_key TEXT NOT NULL,
                       received_bytes INTEGER NOT NULL,
                       sent_bytes INTEGER NOT NULL,
                       timestamp_ms INTEGER NOT NULL
                     );
                     CREATE TABLE IF NOT EXISTS usage_limits (
                       network_key TEXT PRIMARY KEY,
                       limit_bytes INTEGER,
                       billing_cycle_day INTEGER NOT NULL CHECK(billing_cycle_day BETWEEN 1 AND 28)
                     );
                     CREATE TABLE IF NOT EXISTS dns_evidence (
                       id INTEGER PRIMARY KEY,
                       timestamp_ms INTEGER NOT NULL,
                       network_key TEXT NOT NULL,
                       current_name TEXT NOT NULL,
                       current_latency_ms INTEGER,
                       candidate_name TEXT NOT NULL,
                       candidate_latency_ms INTEGER NOT NULL
                     );
                     CREATE INDEX IF NOT EXISTS dns_evidence_network_time ON dns_evidence(network_key, timestamp_ms);
                     CREATE TABLE IF NOT EXISTS alert_state (
                       network_key TEXT PRIMARY KEY,
                       state_json TEXT NOT NULL
                     );
                     CREATE TABLE IF NOT EXISTS alerts (
                       id INTEGER PRIMARY KEY,
                       timestamp_ms INTEGER NOT NULL,
                       network_key TEXT NOT NULL,
                       category TEXT NOT NULL,
                       message TEXT NOT NULL,
                       dismissed INTEGER NOT NULL DEFAULT 0
                     );
                     CREATE INDEX IF NOT EXISTS alerts_time ON alerts(timestamp_ms);
                     PRAGMA user_version=3;
                     COMMIT;",
                )
                .map_err(|error| format!("Cannot initialize local connection history: {error}"))?;
        }
        if version == 1 {
            connection
                .execute_batch(
                    "BEGIN IMMEDIATE;
                     CREATE TABLE IF NOT EXISTS usage_limits (
                       network_key TEXT PRIMARY KEY,
                       limit_bytes INTEGER,
                       billing_cycle_day INTEGER NOT NULL CHECK(billing_cycle_day BETWEEN 1 AND 28)
                     );
                     ALTER TABLE alerts ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE usage_totals ADD COLUMN counter_reset_count INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE usage_totals ADD COLUMN adapter_change_count INTEGER NOT NULL DEFAULT 0;
                     PRAGMA user_version=3;
                     COMMIT;",
                )
                .map_err(|error| format!("Cannot migrate local connection history: {error}"))?;
        }
        if version == 2 {
            connection
                .execute_batch(
                    "BEGIN IMMEDIATE;
                     ALTER TABLE usage_totals ADD COLUMN counter_reset_count INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE usage_totals ADD COLUMN adapter_change_count INTEGER NOT NULL DEFAULT 0;
                     PRAGMA user_version=3;
                     COMMIT;",
                )
                .map_err(|error| format!("Cannot migrate local connection history: {error}"))?;
        }
        Ok(())
    }

    fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let _guard = self
            .access
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let mut connection = self.connect()?;
        operation(&mut connection)
    }

    pub fn record_sample(&self, sample: &ObservationSample) -> Result<(), String> {
        if sample.timestamp_ms <= 0 {
            return Err("Observation timestamp is invalid".into());
        }
        if sample.status == SampleStatus::Missing && sample.missing_reason.is_none() {
            return Err("A missing observation must explain why it is missing".into());
        }
        self.with_connection(|connection| {
            let transaction = connection.transaction().map_err(|error| error.to_string())?;
            if let (Some(key), Some(label), Some(kind)) = (
                sample.network_key.as_deref(),
                sample.network_label.as_deref(),
                sample.network_kind.as_deref(),
            ) {
                transaction
                    .execute(
                        "INSERT INTO network_catalog(network_key,label,kind,first_seen_ms,last_seen_ms)
                         VALUES(?1,?2,?3,?4,?4)
                         ON CONFLICT(network_key) DO UPDATE SET label=excluded.label,kind=excluded.kind,last_seen_ms=excluded.last_seen_ms",
                        params![key, label, kind, sample.timestamp_ms],
                    )
                    .map_err(|error| error.to_string())?;
            }
            transaction
                .execute(
                    "INSERT INTO samples(timestamp_ms,network_key,network_label,network_kind,session_id,access_point_fingerprint,gateway_ms,internet_ms,jitter_ms,signal_dbm,status,missing_reason)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                    params![
                        sample.timestamp_ms,
                        sample.network_key,
                        sample.network_label,
                        sample.network_kind,
                        sample.session_id,
                        sample.access_point_fingerprint,
                        sample.gateway_ms,
                        sample.internet_ms,
                        sample.jitter_ms,
                        sample.signal_dbm,
                        sample.status.as_str(),
                        sample.missing_reason,
                    ],
                )
                .map_err(|error| error.to_string())?;
            transaction.commit().map_err(|error| error.to_string())
        })
    }

    pub fn begin_gap(&self, start_ms: i64, reason: &str) -> Result<i64, String> {
        if start_ms <= 0 || reason.trim().is_empty() || reason.chars().count() > 160 {
            return Err("Invalid history gap".into());
        }
        self.with_connection(|connection| {
            connection
                .execute(
                    "INSERT INTO gaps(start_ms,reason) VALUES(?1,?2)",
                    params![start_ms, reason.trim()],
                )
                .map_err(|error| error.to_string())?;
            Ok(connection.last_insert_rowid())
        })
    }

    pub fn end_gap(&self, id: i64, end_ms: i64) -> Result<(), String> {
        self.with_connection(|connection| {
            let changed = connection
                .execute(
                    "UPDATE gaps SET end_ms=?2 WHERE id=?1 AND end_ms IS NULL AND start_ms<=?2",
                    params![id, end_ms],
                )
                .map_err(|error| error.to_string())?;
            if changed == 1 {
                Ok(())
            } else {
                Err("The history gap is unavailable or already closed".into())
            }
        })
    }

    pub fn close_open_gaps(&self, end_ms: i64, reason: Option<&str>) -> Result<u64, String> {
        if end_ms <= 0 || reason.is_some_and(|value| value.trim().is_empty()) {
            return Err("Invalid history gap close request".into());
        }
        self.with_connection(|connection| {
            connection.execute(
                "UPDATE gaps SET end_ms=?1 WHERE end_ms IS NULL AND start_ms<=?1 AND (?2 IS NULL OR reason=?2)",
                params![end_ms,reason],
            ).map(|changed| changed as u64).map_err(|error| error.to_string())
        })
    }

    pub fn samples_between(
        &self,
        start_ms: i64,
        end_ms: i64,
    ) -> Result<Vec<ObservationSample>, String> {
        validate_range(start_ms, end_ms)?;
        self.with_connection(|connection| {
            let mut statement = connection
                .prepare(
                    "SELECT timestamp_ms,network_key,network_label,network_kind,session_id,access_point_fingerprint,gateway_ms,internet_ms,jitter_ms,signal_dbm,status,missing_reason
                     FROM samples WHERE timestamp_ms>=?1 AND timestamp_ms<?2 ORDER BY timestamp_ms,id",
                )
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map(params![start_ms, end_ms], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<i64>>(6)?,
                        row.get::<_, Option<i64>>(7)?,
                        row.get::<_, Option<f64>>(8)?,
                        row.get::<_, Option<i32>>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, Option<String>>(11)?,
                    ))
                })
                .map_err(|error| error.to_string())?;
            rows.map(|row| {
                let row = row.map_err(|error| error.to_string())?;
                Ok(ObservationSample {
                    timestamp_ms: row.0,
                    network_key: row.1,
                    network_label: row.2,
                    network_kind: row.3,
                    session_id: row.4,
                    access_point_fingerprint: row.5,
                    gateway_ms: row.6,
                    internet_ms: row.7,
                    jitter_ms: row.8,
                    signal_dbm: row.9,
                    status: SampleStatus::parse(&row.10)?,
                    missing_reason: row.11,
                })
            })
            .collect()
        })
    }

    pub fn gaps_between(&self, start_ms: i64, end_ms: i64) -> Result<Vec<ObservationGap>, String> {
        validate_range(start_ms, end_ms)?;
        self.with_connection(|connection| {
            let mut statement = connection
                .prepare(
                    "SELECT start_ms,end_ms,reason FROM gaps
                     WHERE start_ms<?2 AND COALESCE(end_ms,?2)>?1 ORDER BY start_ms,id",
                )
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map(params![start_ms, end_ms], |row| {
                    Ok(ObservationGap {
                        start_ms: row.get(0)?,
                        end_ms: row.get(1)?,
                        reason: row.get(2)?,
                    })
                })
                .map_err(|error| error.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())
        })
    }

    pub fn aggregate_range(
        &self,
        start_ms: i64,
        end_ms: i64,
        bucket_ms: i64,
    ) -> Result<Vec<ObservationBucket>, String> {
        validate_range(start_ms, end_ms)?;
        let span = end_ms - start_ms;
        if bucket_ms <= 0 || span.saturating_add(bucket_ms - 1) / bucket_ms > 5_000 {
            return Err("Choose a history interval that produces at most 5,000 buckets".into());
        }
        let samples = self.samples_between(start_ms, end_ms)?;
        let count = (span.saturating_add(bucket_ms - 1) / bucket_ms) as usize;
        let mut groups: Vec<Vec<&ObservationSample>> = vec![Vec::new(); count];
        for sample in &samples {
            let index = ((sample.timestamp_ms - start_ms) / bucket_ms) as usize;
            if let Some(group) = groups.get_mut(index) {
                group.push(sample);
            }
        }
        Ok(groups
            .into_iter()
            .enumerate()
            .map(|(index, group)| {
                let start = start_ms + index as i64 * bucket_ms;
                let measured_count = group
                    .iter()
                    .filter(|sample| sample.status == SampleStatus::Measured)
                    .count() as u64;
                let missing_count = group
                    .iter()
                    .filter(|sample| {
                        matches!(sample.status, SampleStatus::Missing | SampleStatus::Partial)
                    })
                    .count() as u64;
                let disconnected_count = group
                    .iter()
                    .filter(|sample| sample.status == SampleStatus::Disconnected)
                    .count() as u64;
                ObservationBucket {
                    start_ms: start,
                    end_ms: (start + bucket_ms).min(end_ms),
                    sample_count: group.len() as u64,
                    measured_count,
                    missing_count,
                    disconnected_count,
                    drop_count: group
                        .iter()
                        .filter(|sample| {
                            sample.gateway_ms.is_some() && sample.internet_ms.is_none()
                        })
                        .count() as u64,
                    gateway_average_ms: average(
                        group
                            .iter()
                            .filter_map(|sample| sample.gateway_ms.map(|value| value as f64)),
                    ),
                    internet_average_ms: average(
                        group
                            .iter()
                            .filter_map(|sample| sample.internet_ms.map(|value| value as f64)),
                    ),
                    jitter_average_ms: average(group.iter().filter_map(|sample| sample.jitter_ms)),
                }
            })
            .collect())
    }

    pub fn update_usage(
        &self,
        observation: &CounterObservation,
        maximum_gap_ms: i64,
    ) -> Result<UsageUpdate, String> {
        if observation.timestamp_ms <= 0
            || observation.network_key.is_empty()
            || observation.interface_key.is_empty()
        {
            return Err("Usage counter observation is incomplete".into());
        }
        self.with_connection(|connection| {
            let transaction = connection.transaction().map_err(|error| error.to_string())?;
            let previous = transaction
                .query_row(
                    "SELECT boot_id,network_key,interface_key,received_bytes,sent_bytes,timestamp_ms FROM usage_checkpoint WHERE singleton=1",
                    [],
                    |row| {
                        Ok(CounterCheckpoint {
                            boot_id: row.get(0)?,
                            network_key: row.get(1)?,
                            interface_key: row.get(2)?,
                            received_bytes: integer_to_u64(row.get(3)?)?,
                            sent_bytes: integer_to_u64(row.get(4)?)?,
                            timestamp_ms: row.get(5)?,
                        })
                    },
                )
                .optional()
                .map_err(|error| error.to_string())?;
            let delta = counter_delta(previous.as_ref(), observation, maximum_gap_ms);
            let reset_increment =
                matches!(&delta, CounterDelta::Baseline { reason } if reason == "counter reset");
            let adapter_increment =
                matches!(&delta, CounterDelta::Baseline { reason } if reason == "adapter changed");
            let limit = transaction.query_row(
                "SELECT limit_bytes,billing_cycle_day FROM usage_limits WHERE network_key=?1",
                [&observation.network_key],
                |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, u8>(1)?)),
            ).optional().map_err(|error| error.to_string())?;
            let (limit_bytes, billing_cycle_day) = limit.unwrap_or((None, 1));
            transaction
                .execute(
                    "INSERT INTO network_catalog(network_key,label,kind,first_seen_ms,last_seen_ms)
                     VALUES(?1,?2,?3,?4,?4)
                     ON CONFLICT(network_key) DO UPDATE SET label=excluded.label,kind=excluded.kind,last_seen_ms=excluded.last_seen_ms",
                    params![observation.network_key, observation.network_label, observation.network_kind, observation.timestamp_ms],
                )
                .map_err(|error| error.to_string())?;
            if let CounterDelta::Measured { received_bytes, sent_bytes } = delta {
                transaction
                    .execute(
                        "INSERT INTO usage_totals(network_key,network_label,cycle_start_ms,received_bytes,sent_bytes,limit_bytes,updated_at_ms)
                         VALUES(?1,?2,?3,?4,?5,?6,?7)
                         ON CONFLICT(network_key,cycle_start_ms) DO UPDATE SET
                           network_label=excluded.network_label,
                           received_bytes=usage_totals.received_bytes+excluded.received_bytes,
                           sent_bytes=usage_totals.sent_bytes+excluded.sent_bytes,
                           limit_bytes=excluded.limit_bytes,
                           updated_at_ms=excluded.updated_at_ms",
                        params![observation.network_key, observation.network_label, observation.cycle_start_ms, u64_to_integer(received_bytes)?, u64_to_integer(sent_bytes)?, limit_bytes, observation.timestamp_ms],
                    )
                    .map_err(|error| error.to_string())?;
            } else {
                transaction
                    .execute(
                        "INSERT INTO usage_totals(network_key,network_label,cycle_start_ms,received_bytes,sent_bytes,limit_bytes,updated_at_ms)
                         VALUES(?1,?2,?3,0,0,?4,?5)
                         ON CONFLICT(network_key,cycle_start_ms) DO UPDATE SET network_label=excluded.network_label,limit_bytes=excluded.limit_bytes,updated_at_ms=excluded.updated_at_ms",
                        params![observation.network_key, observation.network_label, observation.cycle_start_ms, limit_bytes, observation.timestamp_ms],
                    )
                    .map_err(|error| error.to_string())?;
            }
            if reset_increment || adapter_increment {
                transaction
                    .execute(
                        "UPDATE usage_totals SET counter_reset_count=counter_reset_count+?3,adapter_change_count=adapter_change_count+?4
                         WHERE network_key=?1 AND cycle_start_ms=?2",
                        params![
                            observation.network_key,
                            observation.cycle_start_ms,
                            reset_increment as i32,
                            adapter_increment as i32
                        ],
                    )
                    .map_err(|error| error.to_string())?;
            }
            transaction
                .execute(
                    "INSERT INTO usage_checkpoint(singleton,boot_id,network_key,interface_key,received_bytes,sent_bytes,timestamp_ms)
                     VALUES(1,?1,?2,?3,?4,?5,?6)
                     ON CONFLICT(singleton) DO UPDATE SET boot_id=excluded.boot_id,network_key=excluded.network_key,interface_key=excluded.interface_key,received_bytes=excluded.received_bytes,sent_bytes=excluded.sent_bytes,timestamp_ms=excluded.timestamp_ms",
                    params![observation.boot_id, observation.network_key, observation.interface_key, u64_to_integer(observation.received_bytes)?, u64_to_integer(observation.sent_bytes)?, observation.timestamp_ms],
                )
                .map_err(|error| error.to_string())?;
            let mut total = read_usage_total(&transaction, &observation.network_key, observation.cycle_start_ms, billing_cycle_day)?;
            let next_warning = warning_level(total.received_bytes.saturating_add(total.sent_bytes), total.limit_bytes);
            let warning_triggered = (next_warning > total.warning_level).then_some(next_warning);
            if next_warning != total.warning_level {
                transaction.execute(
                    "UPDATE usage_totals SET warning_level=?3 WHERE network_key=?1 AND cycle_start_ms=?2",
                    params![observation.network_key, observation.cycle_start_ms, next_warning],
                ).map_err(|error| error.to_string())?;
                total.warning_level = next_warning;
            }
            transaction.commit().map_err(|error| error.to_string())?;
            Ok(UsageUpdate { delta, total, warning_triggered })
        })
    }

    pub fn set_usage_limit(
        &self,
        network_key: &str,
        limit_bytes: Option<u64>,
        billing_cycle_day: u8,
    ) -> Result<(), String> {
        if limit_bytes.is_some_and(|value| value < 1_000_000) {
            return Err("A data limit must be at least 1 MB".into());
        }
        if !(1..=28).contains(&billing_cycle_day) || network_key.is_empty() {
            return Err("Billing cycle day must be between 1 and 28".into());
        }
        self.with_connection(|connection| {
            let transaction = connection.transaction().map_err(|error| error.to_string())?;
            let encoded = limit_bytes.map(u64_to_integer).transpose()?;
            transaction.execute(
                "INSERT INTO usage_limits(network_key,limit_bytes,billing_cycle_day) VALUES(?1,?2,?3)
                 ON CONFLICT(network_key) DO UPDATE SET limit_bytes=excluded.limit_bytes,billing_cycle_day=excluded.billing_cycle_day",
                params![network_key,encoded,billing_cycle_day],
            ).map_err(|error| error.to_string())?;
            transaction.execute(
                "UPDATE usage_totals SET limit_bytes=?2,warning_level=0 WHERE network_key=?1",
                params![network_key,encoded],
            ).map_err(|error| error.to_string())?;
            transaction.commit().map_err(|error| error.to_string())
        })
    }

    pub fn get_usage_limit(&self, network_key: &str) -> Result<Option<UsageLimit>, String> {
        self.with_connection(|connection| {
            connection
                .query_row(
                    "SELECT limit_bytes,billing_cycle_day FROM usage_limits WHERE network_key=?1",
                    [network_key],
                    |row| {
                        Ok(UsageLimit {
                            network_key: network_key.into(),
                            limit_bytes: row
                                .get::<_, Option<i64>>(0)?
                                .map(integer_to_u64)
                                .transpose()?,
                            billing_cycle_day: row.get(1)?,
                        })
                    },
                )
                .optional()
                .map_err(|error| error.to_string())
        })
    }

    pub fn usage_totals(&self) -> Result<Vec<UsageTotal>, String> {
        self.with_connection(|connection| {
            let mut statement = connection.prepare(
                "SELECT t.network_key,t.network_label,t.cycle_start_ms,t.received_bytes,t.sent_bytes,t.limit_bytes,t.warning_level,t.updated_at_ms,COALESCE(l.billing_cycle_day,1),t.counter_reset_count,t.adapter_change_count
                 FROM usage_totals t LEFT JOIN usage_limits l ON l.network_key=t.network_key ORDER BY t.updated_at_ms DESC,t.network_label",
            ).map_err(|error| error.to_string())?;
            let rows = statement.query_map([], usage_row).map_err(|error| error.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
        })
    }

    pub fn record_dns_evidence(&self, evidence: &DnsEvidence) -> Result<(), String> {
        if evidence.timestamp_ms <= 0
            || evidence.network_key.is_empty()
            || evidence.candidate_latency_ms < 0
        {
            return Err("DNS evidence is incomplete".into());
        }
        self.with_connection(|connection| {
            connection.execute(
                "INSERT INTO dns_evidence(timestamp_ms,network_key,current_name,current_latency_ms,candidate_name,candidate_latency_ms)
                 VALUES(?1,?2,?3,?4,?5,?6)",
                params![evidence.timestamp_ms,evidence.network_key,evidence.current_name,evidence.current_latency_ms,evidence.candidate_name,evidence.candidate_latency_ms],
            ).map_err(|error| error.to_string())?;
            Ok(())
        })
    }

    pub fn latest_dns_evidence(
        &self,
        network_key: &str,
        since_ms: i64,
    ) -> Result<Option<DnsEvidence>, String> {
        self.with_connection(|connection| connection.query_row(
            "SELECT timestamp_ms,network_key,current_name,current_latency_ms,candidate_name,candidate_latency_ms
             FROM dns_evidence WHERE network_key=?1 AND timestamp_ms>=?2 ORDER BY timestamp_ms DESC,id DESC LIMIT 1",
            params![network_key,since_ms],
            |row| Ok(DnsEvidence { timestamp_ms: row.get(0)?, network_key: row.get(1)?, current_name: row.get(2)?, current_latency_ms: row.get(3)?, candidate_name: row.get(4)?, candidate_latency_ms: row.get(5)? }),
        ).optional().map_err(|error| error.to_string()))
    }

    pub fn load_alert_state<T: for<'de> Deserialize<'de>>(
        &self,
        network_key: &str,
    ) -> Result<Option<T>, String> {
        self.with_connection(|connection| {
            let value: Option<String> = connection
                .query_row(
                    "SELECT state_json FROM alert_state WHERE network_key=?1",
                    [network_key],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| error.to_string())?;
            value
                .map(|value| {
                    serde_json::from_str(&value)
                        .map_err(|error| format!("Cannot parse alert state: {error}"))
                })
                .transpose()
        })
    }

    pub fn save_alert_state<T: Serialize>(
        &self,
        network_key: &str,
        state: &T,
    ) -> Result<(), String> {
        let value = serde_json::to_string(state).map_err(|error| error.to_string())?;
        self.with_connection(|connection| {
            connection
                .execute(
                    "INSERT INTO alert_state(network_key,state_json) VALUES(?1,?2)
                 ON CONFLICT(network_key) DO UPDATE SET state_json=excluded.state_json",
                    params![network_key, value],
                )
                .map_err(|error| error.to_string())?;
            Ok(())
        })
    }

    pub fn record_alert(
        &self,
        timestamp_ms: i64,
        network_key: &str,
        category: &str,
        message: &str,
    ) -> Result<(), String> {
        self.with_connection(|connection| {
            connection.execute(
                "INSERT INTO alerts(timestamp_ms,network_key,category,message) VALUES(?1,?2,?3,?4)",
                params![timestamp_ms,network_key,category,message],
            ).map_err(|error| error.to_string())?;
            Ok(())
        })
    }

    pub fn alert_inbox(
        &self,
        include_dismissed: bool,
        limit: u32,
    ) -> Result<Vec<AlertRecord>, String> {
        if !(1..=500).contains(&limit) {
            return Err("Alert query limit must be between 1 and 500".into());
        }
        self.with_connection(|connection| {
            let mut statement = connection
                .prepare(
                    "SELECT id,timestamp_ms,network_key,category,message,dismissed FROM alerts
                 WHERE (?1=1 OR dismissed=0) ORDER BY timestamp_ms DESC,id DESC LIMIT ?2",
                )
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map(params![include_dismissed as i32, limit], |row| {
                    Ok(AlertRecord {
                        id: row.get(0)?,
                        timestamp_ms: row.get(1)?,
                        network_key: row.get(2)?,
                        category: row.get(3)?,
                        message: row.get(4)?,
                        dismissed: row.get::<_, i32>(5)? != 0,
                    })
                })
                .map_err(|error| error.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())
        })
    }

    pub fn dismiss_alert(&self, id: i64) -> Result<(), String> {
        self.with_connection(|connection| {
            let changed = connection
                .execute("UPDATE alerts SET dismissed=1 WHERE id=?1", [id])
                .map_err(|error| error.to_string())?;
            if changed == 1 {
                Ok(())
            } else {
                Err("Alert is unavailable".into())
            }
        })
    }

    pub fn dismiss_all_alerts(&self) -> Result<u64, String> {
        self.with_connection(|connection| {
            connection
                .execute("UPDATE alerts SET dismissed=1 WHERE dismissed=0", [])
                .map(|value| value as u64)
                .map_err(|error| error.to_string())
        })
    }

    pub fn apply_retention(&self, now_ms: i64, policy: RetentionPolicy) -> Result<(), String> {
        let policy = policy.validate()?;
        let cutoff = now_ms.saturating_sub(i64::from(policy.days) * 86_400_000);
        self.with_connection(|connection| {
            let transaction = connection.transaction().map_err(|error| error.to_string())?;
            transaction.execute("DELETE FROM samples WHERE timestamp_ms<?1", [cutoff]).map_err(|error| error.to_string())?;
            transaction.execute("DELETE FROM gaps WHERE COALESCE(end_ms,start_ms)<?1", [cutoff]).map_err(|error| error.to_string())?;
            transaction.execute("DELETE FROM dns_evidence WHERE timestamp_ms<?1", [cutoff]).map_err(|error| error.to_string())?;
            transaction.execute("DELETE FROM alerts WHERE timestamp_ms<?1", [cutoff]).map_err(|error| error.to_string())?;
            transaction.execute(
                "DELETE FROM samples WHERE id IN (SELECT id FROM samples ORDER BY timestamp_ms DESC,id DESC LIMIT -1 OFFSET ?1)",
                [u64_to_integer(policy.sample_row_cap)?],
            ).map_err(|error| error.to_string())?;
            transaction.execute(
                "DELETE FROM usage_totals WHERE rowid IN (SELECT rowid FROM usage_totals ORDER BY updated_at_ms DESC LIMIT -1 OFFSET ?1)",
                [u64_to_integer(policy.usage_cycle_cap)?],
            ).map_err(|error| error.to_string())?;
            transaction.commit().map_err(|error| error.to_string())?;
            connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").map_err(|error| error.to_string())
        })
    }

    pub fn delete_all(&self) -> Result<(), String> {
        // Clones share this lock, so deletion cannot race an in-flight read or
        // writer that still has the SQLite database or its WAL open.
        let _guard = self
            .access
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        for suffix in ["", "-wal", "-shm", "-journal"] {
            let path = PathBuf::from(format!("{}{}", self.path.to_string_lossy(), suffix));
            match fs::remove_file(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(format!("Cannot delete local connection history: {error}"));
                }
            }
        }
        Ok(())
    }
}

fn validate_range(start_ms: i64, end_ms: i64) -> Result<(), String> {
    if start_ms < 0 || end_ms <= start_ms {
        Err("History range is invalid".into())
    } else {
        Ok(())
    }
}

fn average(values: impl Iterator<Item = f64>) -> Option<f64> {
    let values: Vec<_> = values.collect();
    (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
}

fn u64_to_integer(value: u64) -> Result<i64, String> {
    i64::try_from(value).map_err(|_| "A byte counter exceeds the supported range".into())
}

fn integer_to_u64(value: i64) -> rusqlite::Result<u64> {
    u64::try_from(value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Integer,
            Box::new(error),
        )
    })
}

fn usage_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<UsageTotal> {
    Ok(UsageTotal {
        network_key: row.get(0)?,
        network_label: row.get(1)?,
        cycle_start_ms: row.get(2)?,
        received_bytes: integer_to_u64(row.get(3)?)?,
        sent_bytes: integer_to_u64(row.get(4)?)?,
        limit_bytes: row
            .get::<_, Option<i64>>(5)?
            .map(integer_to_u64)
            .transpose()?,
        warning_level: row.get(6)?,
        updated_at_ms: row.get(7)?,
        billing_cycle_day: row.get(8)?,
        counter_reset_count: integer_to_u64(row.get(9)?)?,
        adapter_change_count: integer_to_u64(row.get(10)?)?,
    })
}

fn read_usage_total(
    connection: &Connection,
    network_key: &str,
    cycle_start_ms: i64,
    billing_cycle_day: u8,
) -> Result<UsageTotal, String> {
    connection.query_row(
        "SELECT network_key,network_label,cycle_start_ms,received_bytes,sent_bytes,limit_bytes,warning_level,updated_at_ms,counter_reset_count,adapter_change_count
         FROM usage_totals WHERE network_key=?1 AND cycle_start_ms=?2",
        params![network_key,cycle_start_ms], |row| {
            Ok(UsageTotal { network_key: row.get(0)?, network_label: row.get(1)?, cycle_start_ms: row.get(2)?, received_bytes: integer_to_u64(row.get(3)?)?, sent_bytes: integer_to_u64(row.get(4)?)?, limit_bytes: row.get::<_,Option<i64>>(5)?.map(integer_to_u64).transpose()?, warning_level: row.get(6)?, updated_at_ms: row.get(7)?, billing_cycle_day, counter_reset_count: integer_to_u64(row.get(8)?)?, adapter_change_count: integer_to_u64(row.get(9)?)? })
        },
    ).map_err(|error| error.to_string())
}

fn warning_level(total_bytes: u64, limit_bytes: Option<u64>) -> i32 {
    let Some(limit) = limit_bytes.filter(|value| *value > 0) else {
        return 0;
    };
    if total_bytes >= limit {
        2
    } else if total_bytes.saturating_mul(100) >= limit.saturating_mul(80) {
        1
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "netmask-observations-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn sample(
        timestamp_ms: i64,
        internet_ms: Option<i64>,
        status: SampleStatus,
    ) -> ObservationSample {
        ObservationSample {
            timestamp_ms,
            network_key: Some("network-a".into()),
            network_label: Some("Studio".into()),
            network_kind: Some("wifi".into()),
            session_id: Some("session-a".into()),
            access_point_fingerprint: Some("ap-a".into()),
            gateway_ms: Some(5),
            internet_ms,
            jitter_ms: internet_ms.map(|_| 2.0),
            signal_dbm: Some(-55),
            status,
            missing_reason: None,
        }
    }

    #[test]
    fn samples_keep_missing_values_and_buckets_do_not_invent_them() {
        let directory = directory("samples");
        let db = ObservationDb::open(&directory).unwrap();
        db.record_sample(&sample(1_000, Some(20), SampleStatus::Measured))
            .unwrap();
        db.record_sample(&sample(2_000, None, SampleStatus::Partial))
            .unwrap();
        let buckets = db.aggregate_range(0, 4_000, 2_000).unwrap();
        assert_eq!(buckets[0].internet_average_ms, Some(20.0));
        assert_eq!(buckets[1].internet_average_ms, None);
        assert_eq!(buckets[1].drop_count, 1);
        assert_eq!(buckets[1].missing_count, 1);
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn missing_sample_requires_an_explicit_reason() {
        let directory = directory("reason");
        let db = ObservationDb::open(&directory).unwrap();
        let value = sample(1_000, None, SampleStatus::Missing);
        assert!(db.record_sample(&value).is_err());
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn pause_gaps_are_explicit_and_close_once() {
        let directory = directory("gaps");
        let db = ObservationDb::open(&directory).unwrap();
        let id = db.begin_gap(1_000, "recording paused").unwrap();
        db.end_gap(id, 3_000).unwrap();
        assert!(db.end_gap(id, 4_000).is_err());
        assert_eq!(
            db.gaps_between(0, 5_000).unwrap()[0].reason,
            "recording paused"
        );
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn persisted_pause_gap_can_close_after_restart() {
        let directory = directory("restart-gap");
        let db = ObservationDb::open(&directory).unwrap();
        db.begin_gap(1_000, "recording paused").unwrap();
        drop(db);
        let db = ObservationDb::open(&directory).unwrap();
        assert_eq!(
            db.close_open_gaps(5_000, Some("recording paused")).unwrap(),
            1
        );
        let gaps = db.gaps_between(0, 6_000).unwrap();
        assert_eq!(gaps[0].end_ms, Some(5_000));
        assert_eq!(
            db.close_open_gaps(6_000, Some("recording paused")).unwrap(),
            0
        );
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn usage_survives_reopen_but_refuses_switches_resets_and_long_gaps() {
        let directory = directory("usage");
        let db = ObservationDb::open(&directory).unwrap();
        let mut observation = CounterObservation {
            boot_id: "boot".into(),
            network_key: "network-a".into(),
            network_label: "Studio".into(),
            network_kind: "wifi".into(),
            interface_key: "adapter-a".into(),
            received_bytes: 1_000,
            sent_bytes: 2_000,
            timestamp_ms: 1_000,
            cycle_start_ms: 0,
        };
        assert!(matches!(
            db.update_usage(&observation, 15_000).unwrap().delta,
            CounterDelta::Baseline { .. }
        ));
        observation.received_bytes = 1_500;
        observation.sent_bytes = 2_250;
        observation.timestamp_ms = 5_000;
        let update = ObservationDb::open(&directory)
            .unwrap()
            .update_usage(&observation, 15_000)
            .unwrap();
        assert_eq!(update.total.received_bytes, 500);
        assert_eq!(update.total.sent_bytes, 250);
        observation.network_key = "network-b".into();
        observation.network_label = "Workshop".into();
        observation.timestamp_ms = 6_000;
        assert!(
            matches!(db.update_usage(&observation, 15_000).unwrap().delta, CounterDelta::Baseline { ref reason } if reason == "network changed")
        );
        observation.timestamp_ms = 30_000;
        observation.received_bytes = 10;
        observation.sent_bytes = 10;
        assert!(matches!(
            db.update_usage(&observation, 15_000).unwrap().delta,
            CounterDelta::Baseline { .. }
        ));
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn retention_caps_rows_and_delete_removes_sidecars() {
        let directory = directory("retention");
        let db = ObservationDb::open(&directory).unwrap();
        for timestamp in 1..=6 {
            db.record_sample(&sample(timestamp * 1_000, Some(20), SampleStatus::Measured))
                .unwrap();
        }
        db.apply_retention(
            7_000,
            RetentionPolicy {
                days: 1,
                sample_row_cap: 100,
                usage_cycle_cap: 10,
            },
        )
        .unwrap();
        assert_eq!(db.samples_between(0, 8_000).unwrap().len(), 6);
        db.delete_all().unwrap();
        assert!(!db.path().exists());
        assert!(!PathBuf::from(format!("{}-wal", db.path().to_string_lossy())).exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn usage_limit_rolls_into_new_cycles_and_warning_resets() {
        let directory = directory("usage-limits");
        let db = ObservationDb::open(&directory).unwrap();
        db.set_usage_limit("network-a", Some(1_000_000), 12)
            .unwrap();
        assert_eq!(
            db.get_usage_limit("network-a")
                .unwrap()
                .unwrap()
                .billing_cycle_day,
            12
        );
        let mut observation = CounterObservation {
            boot_id: "boot".into(),
            network_key: "network-a".into(),
            network_label: "Studio".into(),
            network_kind: "wifi".into(),
            interface_key: "adapter-a".into(),
            received_bytes: 0,
            sent_bytes: 0,
            timestamp_ms: 1_000,
            cycle_start_ms: 100,
        };
        db.update_usage(&observation, 15_000).unwrap();
        observation.received_bytes = 850_000;
        observation.timestamp_ms = 2_000;
        let first = db.update_usage(&observation, 15_000).unwrap();
        assert_eq!(first.warning_triggered, Some(1));
        assert_eq!(first.total.limit_bytes, Some(1_000_000));
        observation.received_bytes = 1_100_000;
        observation.timestamp_ms = 3_000;
        assert_eq!(
            db.update_usage(&observation, 15_000)
                .unwrap()
                .warning_triggered,
            Some(2)
        );
        observation.cycle_start_ms = 200;
        observation.received_bytes = 1_200_000;
        observation.timestamp_ms = 4_000;
        let next = db.update_usage(&observation, 15_000).unwrap();
        assert_eq!(next.total.received_bytes, 100_000);
        assert_eq!(next.total.warning_level, 0);
        assert_eq!(next.total.billing_cycle_day, 12);
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn usage_tracks_only_counter_resets_and_adapter_changes() {
        let directory = directory("usage-discontinuities");
        let db = ObservationDb::open(&directory).unwrap();
        let mut observation = CounterObservation {
            boot_id: "boot".into(),
            network_key: "network-a".into(),
            network_label: "Studio".into(),
            network_kind: "wifi".into(),
            interface_key: "adapter-a".into(),
            received_bytes: 1_000,
            sent_bytes: 1_000,
            timestamp_ms: 1_000,
            cycle_start_ms: 0,
        };
        db.update_usage(&observation, 15_000).unwrap();
        observation.received_bytes = 10;
        observation.sent_bytes = 10;
        observation.timestamp_ms = 2_000;
        let reset = db.update_usage(&observation, 15_000).unwrap();
        assert_eq!(reset.total.counter_reset_count, 1);
        assert_eq!(reset.total.adapter_change_count, 0);
        observation.interface_key = "adapter-b".into();
        observation.timestamp_ms = 3_000;
        let adapter = db.update_usage(&observation, 15_000).unwrap();
        assert_eq!(adapter.total.counter_reset_count, 1);
        assert_eq!(adapter.total.adapter_change_count, 1);
        observation.network_key = "network-b".into();
        observation.network_label = "Workshop".into();
        observation.timestamp_ms = 4_000;
        let switched = db.update_usage(&observation, 15_000).unwrap();
        assert_eq!(switched.total.counter_reset_count, 0);
        assert_eq!(switched.total.adapter_change_count, 0);
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn alert_inbox_can_be_dismissed_without_deleting_evidence() {
        let directory = directory("alerts");
        let db = ObservationDb::open(&directory).unwrap();
        db.record_alert(1_000, "network-a", "latency", "Connection response changed")
            .unwrap();
        let alert = db.alert_inbox(false, 10).unwrap().pop().unwrap();
        db.dismiss_alert(alert.id).unwrap();
        assert!(db.alert_inbox(false, 10).unwrap().is_empty());
        assert_eq!(db.alert_inbox(true, 10).unwrap().len(), 1);
        db.delete_all().unwrap();
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn newer_schema_is_preserved_and_rejected() {
        let directory = directory("future");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(DATABASE_NAME);
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch("PRAGMA user_version=99;").unwrap();
        drop(connection);
        assert!(ObservationDb::open(&directory).is_err());
        assert!(path.exists());
        let _ = fs::remove_dir_all(directory);
    }
}
