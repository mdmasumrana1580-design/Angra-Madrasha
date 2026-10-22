CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  designation TEXT NOT NULL DEFAULT '' CHECK(length(designation) <= 100),
  subject TEXT NOT NULL DEFAULT '' CHECK(length(subject) <= 100),
  phone TEXT NOT NULL DEFAULT '' CHECK(length(phone) <= 30),
  photo_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  class_name TEXT NOT NULL DEFAULT '' CHECK(length(class_name) <= 50),
  roll TEXT NOT NULL DEFAULT '' CHECK(length(roll) <= 30),
  photo_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
);

CREATE INDEX IF NOT EXISTS idx_teachers_name
ON teachers(name);

CREATE INDEX IF NOT EXISTS idx_students_class_roll
ON students(class_name, roll);
