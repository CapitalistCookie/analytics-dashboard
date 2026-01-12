CREATE TABLE staff (
	id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	role VARCHAR(50) NOT NULL, 
	badge_id VARCHAR(50), 
	photo_path VARCHAR(500), 
	frigate_face_id VARCHAR(100), 
	face_trained BOOLEAN, 
	is_active BOOLEAN, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (badge_id)
);
CREATE INDEX ix_staff_id ON staff (id);
CREATE TABLE zones (
	id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	zone_type VARCHAR(50) NOT NULL, 
	capacity INTEGER, 
	camera_ids VARCHAR(500), 
	polygon VARCHAR(2000), 
	color VARCHAR(20), 
	is_active BOOLEAN, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_zones_id ON zones (id);
CREATE TABLE after_hours_schedules (
	id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	day_of_week INTEGER NOT NULL, 
	start_hour INTEGER NOT NULL, 
	start_minute INTEGER, 
	end_hour INTEGER NOT NULL, 
	end_minute INTEGER, 
	is_enabled BOOLEAN, 
	created_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_after_hours_schedules_id ON after_hours_schedules (id);
CREATE TABLE users (
	id INTEGER NOT NULL, 
	username VARCHAR(50) NOT NULL, 
	email VARCHAR(100), 
	display_name VARCHAR(100), 
	hashed_password VARCHAR(200) NOT NULL, 
	role VARCHAR(20), 
	is_active BOOLEAN, 
	photo_path VARCHAR(500), 
	notify_email BOOLEAN, 
	notify_in_app BOOLEAN, 
	notify_alerts BOOLEAN, 
	notify_reports BOOLEAN, 
	created_at DATETIME, 
	last_login DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (username), 
	UNIQUE (email)
);
CREATE INDEX ix_users_id ON users (id);
CREATE TABLE business_hours (
	id INTEGER NOT NULL, 
	day_of_week INTEGER NOT NULL, 
	is_open BOOLEAN, 
	open_hour INTEGER, 
	open_minute INTEGER, 
	close_hour INTEGER, 
	close_minute INTEGER, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_business_hours_id ON business_hours (id);
CREATE TABLE shift_summaries (
	id INTEGER NOT NULL, 
	shift_date DATETIME NOT NULL, 
	shift_type VARCHAR(20) NOT NULL, 
	start_time VARCHAR(10) NOT NULL, 
	end_time VARCHAR(10) NOT NULL, 
	total_customers INTEGER, 
	peak_hour VARCHAR(20), 
	peak_occupancy INTEGER, 
	avg_wait_time FLOAT, 
	table_turnovers INTEGER, 
	incidents_count INTEGER, 
	revenue_estimate FLOAT, 
	staff_count INTEGER, 
	notes VARCHAR(1000), 
	created_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_shift_summaries_id ON shift_summaries (id);
CREATE TABLE events (
	id INTEGER NOT NULL, 
	frigate_event_id VARCHAR(100), 
	camera_id VARCHAR(50) NOT NULL, 
	label VARCHAR(50) NOT NULL, 
	zone_id INTEGER, 
	start_time DATETIME NOT NULL, 
	end_time DATETIME, 
	score FLOAT, 
	thumbnail_path VARCHAR(500), 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(zone_id) REFERENCES zones (id)
);
CREATE UNIQUE INDEX ix_events_frigate_event_id ON events (frigate_event_id);
CREATE INDEX ix_events_id ON events (id);
CREATE TABLE cameras (
	id INTEGER NOT NULL, 
	camera_id VARCHAR(50) NOT NULL, 
	name VARCHAR(100), 
	location VARCHAR(200), 
	zone_id INTEGER, 
	is_active BOOLEAN, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (camera_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (id)
);
CREATE INDEX ix_cameras_id ON cameras (id);
CREATE TABLE alert_configs (
	id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	alert_type VARCHAR(50) NOT NULL, 
	severity VARCHAR(20), 
	threshold_value FLOAT, 
	threshold_operator VARCHAR(10), 
	zone_id INTEGER, 
	camera_id VARCHAR(50), 
	is_enabled BOOLEAN, 
	notify_email BOOLEAN, 
	notify_webhook BOOLEAN, 
	webhook_url VARCHAR(500), 
	cooldown_minutes INTEGER, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(zone_id) REFERENCES zones (id)
);
CREATE INDEX ix_alert_configs_id ON alert_configs (id);
CREATE TABLE audit_logs (
	id INTEGER NOT NULL, 
	user_id INTEGER, 
	username VARCHAR(50), 
	action VARCHAR(50) NOT NULL, 
	resource_type VARCHAR(50) NOT NULL, 
	resource_id VARCHAR(50), 
	details VARCHAR(1000), 
	ip_address VARCHAR(50), 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE INDEX ix_audit_logs_id ON audit_logs (id);
CREATE TABLE app_settings (
	id INTEGER NOT NULL, 
	"key" VARCHAR(100) NOT NULL, 
	value VARCHAR(1000), 
	value_type VARCHAR(20), 
	category VARCHAR(50), 
	description VARCHAR(500), 
	updated_at DATETIME, 
	updated_by INTEGER, 
	PRIMARY KEY (id), 
	UNIQUE ("key"), 
	FOREIGN KEY(updated_by) REFERENCES users (id)
);
CREATE INDEX ix_app_settings_id ON app_settings (id);
CREATE TABLE scheduled_reports (
	id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	report_type VARCHAR(50) NOT NULL, 
	schedule VARCHAR(20) NOT NULL, 
	day_of_week INTEGER, 
	day_of_month INTEGER, 
	hour INTEGER, 
	email_recipients VARCHAR(1000), 
	is_enabled BOOLEAN, 
	last_run DATETIME, 
	created_by INTEGER, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);
CREATE INDEX ix_scheduled_reports_id ON scheduled_reports (id);
CREATE TABLE alerts (
	id INTEGER NOT NULL, 
	config_id INTEGER, 
	alert_type VARCHAR(50) NOT NULL, 
	severity VARCHAR(20) NOT NULL, 
	message VARCHAR(500) NOT NULL, 
	details VARCHAR(1000), 
	camera_id VARCHAR(50), 
	zone_id INTEGER, 
	is_acknowledged BOOLEAN, 
	acknowledged_by VARCHAR(100), 
	acknowledged_at DATETIME, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(config_id) REFERENCES alert_configs (id), 
	FOREIGN KEY(zone_id) REFERENCES zones (id)
);
CREATE INDEX ix_alerts_id ON alerts (id);
CREATE TABLE incidents (
	id INTEGER NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	description VARCHAR(2000), 
	incident_type VARCHAR(50) NOT NULL, 
	severity VARCHAR(20), 
	status VARCHAR(20), 
	camera_id VARCHAR(50), 
	zone_id INTEGER, 
	location VARCHAR(200), 
	assigned_to INTEGER, 
	reported_by INTEGER, 
	frigate_event_id VARCHAR(100), 
	clip_url VARCHAR(500), 
	snapshot_url VARCHAR(500), 
	resolution_notes VARCHAR(1000), 
	resolved_at DATETIME, 
	resolved_by INTEGER, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(zone_id) REFERENCES zones (id), 
	FOREIGN KEY(assigned_to) REFERENCES staff (id), 
	FOREIGN KEY(reported_by) REFERENCES users (id), 
	FOREIGN KEY(resolved_by) REFERENCES users (id)
);
CREATE INDEX ix_incidents_id ON incidents (id);
CREATE TABLE shift_notes (
	id INTEGER NOT NULL, 
	content VARCHAR(2000) NOT NULL, 
	category VARCHAR(50), 
	is_pinned BOOLEAN, 
	is_acknowledged BOOLEAN, 
	acknowledged_by INTEGER, 
	acknowledged_at DATETIME, 
	created_by INTEGER NOT NULL, 
	shift_date DATETIME NOT NULL, 
	shift_type VARCHAR(20), 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(acknowledged_by) REFERENCES users (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);
CREATE INDEX ix_shift_notes_id ON shift_notes (id);
CREATE TABLE tracked_persons (
	id INTEGER NOT NULL, 
	display_id VARCHAR(10) NOT NULL, 
	first_seen DATETIME, 
	last_seen DATETIME, 
	first_camera_id VARCHAR(50), 
	last_camera_id VARCHAR(50), 
	staff_id INTEGER, 
	is_customer BOOLEAN, 
	visit_count INTEGER, 
	is_active BOOLEAN, 
	created_at DATETIME, 
	updated_at DATETIME, name VARCHAR(100), is_regular BOOLEAN DEFAULT 0, notes VARCHAR(500), person_type VARCHAR(20) DEFAULT "visitor", 
	PRIMARY KEY (id), 
	UNIQUE (display_id), 
	FOREIGN KEY(staff_id) REFERENCES staff (id)
);
CREATE INDEX ix_tracked_persons_id ON tracked_persons (id);
CREATE TABLE person_embeddings (
	id INTEGER NOT NULL, 
	person_id INTEGER NOT NULL, 
	embedding BLOB NOT NULL, 
	camera_id VARCHAR(50), 
	confidence FLOAT, 
	created_at DATETIME, is_verified BOOLEAN DEFAULT 0, 
	PRIMARY KEY (id), 
	FOREIGN KEY(person_id) REFERENCES tracked_persons (id) ON DELETE CASCADE
);
CREATE INDEX ix_person_embeddings_person_id ON person_embeddings (person_id);
CREATE INDEX ix_person_embeddings_id ON person_embeddings (id);
CREATE TABLE person_sightings (
	id INTEGER NOT NULL, 
	person_id INTEGER NOT NULL, 
	camera_id VARCHAR(50) NOT NULL, 
	frigate_event_id VARCHAR(100), 
	zone_name VARCHAR(100), 
	enter_time DATETIME, 
	exit_time DATETIME, 
	confidence FLOAT, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(person_id) REFERENCES tracked_persons (id) ON DELETE CASCADE
);
CREATE INDEX ix_person_sightings_camera_id ON person_sightings (camera_id);
CREATE INDEX ix_person_sightings_id ON person_sightings (id);
CREATE INDEX ix_person_sightings_person_id ON person_sightings (person_id);
CREATE TABLE staff_appearance_embeddings (
	id INTEGER NOT NULL, 
	staff_id INTEGER NOT NULL, 
	embedding BLOB NOT NULL, 
	camera_id VARCHAR(50), 
	confidence FLOAT, 
	is_verified BOOLEAN, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(staff_id) REFERENCES staff (id) ON DELETE CASCADE
);
CREATE INDEX ix_staff_appearance_embeddings_staff_id ON staff_appearance_embeddings (staff_id);
CREATE INDEX ix_staff_appearance_embeddings_id ON staff_appearance_embeddings (id);
CREATE TABLE negative_pairs (
	id INTEGER NOT NULL, 
	person_id_a INTEGER NOT NULL, 
	person_id_b INTEGER NOT NULL, 
	created_by INTEGER, 
	reason VARCHAR(200), 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(person_id_a) REFERENCES tracked_persons (id) ON DELETE CASCADE, 
	FOREIGN KEY(person_id_b) REFERENCES tracked_persons (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);
CREATE INDEX ix_negative_pairs_id ON negative_pairs (id);
CREATE INDEX ix_negative_pairs_person_id_b ON negative_pairs (person_id_b);
CREATE INDEX ix_negative_pairs_person_id_a ON negative_pairs (person_id_a);
