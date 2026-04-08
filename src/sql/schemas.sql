-- subscribers
DROP TABLE IF EXISTS subscribers;
CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    email TEXT NOT NULL UNIQUE,           
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- vita.tw 
DROP TABLE IF EXISTS vita;
CREATE TABLE IF NOT EXISTS vita (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    post_id INTEGER NOT NULL UNIQUE,      
    post_date DATETIME NOT NULL,
    post_url TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_vita_date ON vita(post_date);

-- peopo.org 
DROP TABLE IF EXISTS peopo;
CREATE TABLE IF NOT EXISTS peopo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    post_id INTEGER NOT NULL UNIQUE,      
    post_date DATETIME NOT NULL,
    post_url TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_peopo_date ON peopo(post_date);

DROP TABLE IF EXISTS monitor_status; -- cache 
CREATE TABLE IF NOT EXISTS monitor_status (
    platform TEXT PRIMARY KEY, -- vita or peopo
    last_check_at DATETIME,           
    last_success_at DATETIME,         
    checking_status TEXT DEFAULT 'pending', -- pending, success, missing    
    latest_post_id INTEGER  
    lastest_post_url TEXT          
);

INSERT OR IGNORE INTO monitor_status (platform) VALUES ('vita'), ('peopo');
