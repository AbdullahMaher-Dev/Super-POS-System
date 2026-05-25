import sqlite3
import os

DB_PATH = os.path.join(os.path.expanduser("~"), "RunStore_WebPOS.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("""CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        barcode TEXT UNIQUE, 
        brand TEXT, 
        size TEXT, 
        made_in TEXT, 
        type TEXT, 
        price_wholesale REAL, 
        price_sell REAL, 
        qty INTEGER)""")
    
    cur.execute("""CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        customer TEXT, 
        mobile TEXT, 
        address TEXT, 
        city TEXT, 
        shipping REAL, 
        discount REAL, 
        total REAL, 
        net_profit REAL)""")
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        product_id INTEGER,
        product_name TEXT,
        price REAL,
        qty INTEGER,
        total REAL
        )
        """)

    cur.execute("CREATE TABLE IF NOT EXISTS users (role TEXT, username TEXT, password TEXT)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)")
    
    conn.commit()
    conn.close()

def execute_query(query, params=()):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(query, params)
    conn.commit()
    last_id = cur.lastrowid
    conn.close()
    return last_id

def fetch_query(query, params=()):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()
    return rows