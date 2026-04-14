import sqlite3

def migrate():
    conn = sqlite3.connect("./slugroute.db")
    cursor = conn.cursor()
    # Drop and recreate to ensure clean uppercase names
    cursor.execute("DROP TABLE IF EXISTS buildings")
    cursor.execute("CREATE TABLE buildings (name TEXT PRIMARY KEY, lat REAL, lng REAL)")
    with open("./bulding-coordinates.txt", 'r') as f:
        for line in f:
            if '=' not in line: continue
            name, coords = line.split('=')
            lat, lng = coords.split(',')
            # FORCE UPPERCASE HERE
            clean_name = name.strip().upper()
            cursor.execute("INSERT OR REPLACE INTO buildings VALUES (?, ?, ?)",
                           (clean_name, float(lat.strip()), float(lng.strip())))
    conn.commit()
    conn.close()
    print("Coordinates imported successfully in UPPERCASE.")

if __name__ == "__main__":
    migrate()
