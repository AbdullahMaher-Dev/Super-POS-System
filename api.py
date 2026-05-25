import os 
import csv          
import webview      
from datetime import datetime
import shutil
import time
import random
import subprocess  
import ctypes
from backend.database import execute_query, fetch_query

class POS_API:
    def __init__(self):
        self.window = None

    def set_window(self, window):
        self.window = window

    def close_app(self):
        if self.window:
            self.window.destroy()
        os._exit(0)

    # 🔴 دالة القناص الذكي (بتصطاد الطابعة من جزء من اسمها وتتجاهل المسافات المخفية)
    def set_active_printer(self, printer_type):
        try:
            if printer_type == 'receipt':
                exact_name = "POSPrinter POS80"
                keyword = "POS80"  # الكلمة الدلالية
            else:
                exact_name = "Xprinter XP-233B"
                keyword = "233B"   # الكلمة الدلالية
                
            # 1. نظام القناص (باورشيل): بيبحث عن أي طابعة تحتوي على الكلمة الدلالية ويجبرها تبقى Default
            ps_script = f"""
            $printers = Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Name LIKE '%{keyword}%'"
            if ($printers) {{
                foreach ($p in $printers) {{
                    $p.SetDefaultPrinter()
                    break
                }}
            }}
            """
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], creationflags=0x08000000)
            
            # 2. الطريقة المباشرة للتأكيد اللحظي
            ctypes.windll.winspool.SetDefaultPrinterW(exact_name)
            
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ================= 1. إدارة المنتجات =================
    def get_all_products(self):
        rows = fetch_query("SELECT * FROM products ORDER BY id DESC LIMIT 500")
        return [
            {
                "id": r[0], "barcode": r[1], "brand": r[2], "size": r[3], 
                "made_in": r[4], "type": r[5], "price_wholesale": r[6], 
                "price_sell": r[7], "qty": r[8]
            } for r in rows
        ]

    def add_product(self, barcode, brand, size_input, made_in, p_type, wholesale, sell, qty_input):
        try:
            sizes = [s.strip() for s in str(size_input).split(',') if s.strip()]
            qtys = [q.strip() for q in str(qty_input).split(',') if q.strip()]
            
            for i, s in enumerate(sizes):
                if len(qtys) == len(sizes):
                    q = int(qtys[i])
                elif len(qtys) == 1:
                    q = int(qtys[0])
                else:
                    return {"success": False, "error": "عدد الكميات لا يتطابق مع عدد المقاسات!"}

                if not barcode:
                    unique_barcode = f"{int(time.time())}{random.randint(10, 99)}"
                    time.sleep(0.01) 
                else:
                    unique_barcode = f"{barcode}-{s}" if len(sizes) > 1 else barcode

                execute_query("INSERT INTO products (barcode, brand, size, made_in, type, price_wholesale, price_sell, qty) VALUES (?,?,?,?,?,?,?,?)",
                              (unique_barcode, brand, s, made_in, p_type, float(wholesale), float(sell), q))
            
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_product(self, p_id, price, qty):
        try:
            execute_query("UPDATE products SET price_sell=?, qty=? WHERE id=?", (float(price), int(qty), p_id))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_product(self, p_id):
        try:
            execute_query("DELETE FROM products WHERE id=?", (p_id,))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def scan_barcode(self, barcode):
        rows = fetch_query("SELECT * FROM products WHERE barcode=? LIMIT 1", (barcode,))
        if rows:
            r = rows[0]
            return {
                "id": r[0], "barcode": r[1], "brand": r[2], "size": r[3], 
                "made_in": r[4], "type": r[5], "price_wholesale": r[6], 
                "price_sell": r[7], "qty": r[8]
            }
        return None

    # ================= 2. إدارة المبيعات ================  
    def save_sale(self, customer, mobile, address, city, shipping, discount, total, net_profit, items):
        try:
            local_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            sale_id = execute_query(
                "INSERT INTO sales (date, customer, mobile, address, city, shipping, discount, total, net_profit) VALUES (?,?,?,?,?,?,?,?,?)",
                (local_time, customer, mobile, address, city, float(shipping), float(discount), float(total), float(net_profit))
            )
            for item in items:
                bought_qty = int(item.get('qty', 1))
                execute_query(
                    "INSERT INTO sale_items (sale_id, product_id, product_name, price, qty, total) VALUES (?,?,?,?,?,?)",
                  (sale_id, item['id'], item['name'], item['price'], bought_qty, float(item['price']) * bought_qty)
                )       
                execute_query("UPDATE products SET qty = qty - ? WHERE id = ? AND qty >= ?", (bought_qty, item['id'], bought_qty))

            return {"success": True, "sale_id": sale_id}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_reports(self, period):
        today_str = datetime.now().strftime('%Y-%m-%d')
        month_str = datetime.now().strftime('%Y-%m')
        year_str = datetime.now().strftime('%Y')

        where_clause = ""
        if period == "today":
            where_clause = f" WHERE date LIKE '{today_str}%'"
        elif period == "month":
            where_clause = f" WHERE date LIKE '{month_str}%'"
        elif period == "year":
            where_clause = f" WHERE date LIKE '{year_str}%'"

        totals_query = f"SELECT SUM(total), SUM(net_profit) FROM sales {where_clause}"
        t_res = fetch_query(totals_query)
        
        total_sales = t_res[0][0] if t_res and t_res[0][0] else 0.0
        total_profit = t_res[0][1] if t_res and t_res[0][1] else 0.0
        total_cost = total_sales - total_profit 

        q = f"SELECT date, customer, mobile, address, city, total, discount FROM sales {where_clause} ORDER BY id DESC"
        sales_data = fetch_query(q)
        
        formatted_sales = []
        for s in sales_data:
            row = list(s)
            try:
                dt = datetime.strptime(row[0], '%Y-%m-%d %H:%M:%S')
                row[0] = dt.strftime('%Y-%m-%d %I:%M %p')
            except: pass
            formatted_sales.append(row)

        return {"wholesale": round(total_cost, 2), "sell": round(total_sales, 2), "net": round(total_profit, 2), "sales_list": formatted_sales}

    def get_reports_by_date(self, date):
        rows = fetch_query("SELECT SUM(total), SUM(net_profit) FROM sales WHERE date LIKE ?", (date + "%",))
        total_sales = rows[0][0] if rows and rows[0][0] else 0
        total_profit = rows[0][1] if rows and rows[0][1] else 0
        return {"wholesale": total_sales - total_profit, "sell": total_sales, "net": total_profit}

    def export_reports_excel(self, period):
        data = self.get_reports(period)
        sales_list = data["sales_list"]

        if not self.window: return {"success": False, "error": "Window not found"}

        save_filename = f"RunStore_Report_{period}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        result = self.window.create_file_dialog(webview.SAVE_DIALOG, directory='', save_filename=save_filename, file_types=('CSV Files (*.csv)', 'All Files (*.*)'))

        if result:
            filepath = result[0]
            try:
                with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
                    writer = csv.writer(f)
                    writer.writerow(["التاريخ", "العميل", "الموبايل", "العنوان", "المحافظة/المدينة", "الإجمالي", "الخصم"])
                    for row in sales_list:
                        writer.writerow(row)
                return {"success": True, "path": filepath}
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "Cancelled"}
    
    def export_inventory_excel(self):
        if not self.window: return {"success": False, "error": "Window not found"}
        save_filename = f"RunStore_Inventory_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        result = self.window.create_file_dialog(webview.SAVE_DIALOG, directory='', save_filename=save_filename, file_types=('CSV Files (*.csv)', 'All Files (*.*)'))

        if result:
            filepath = result[0]
            try:
                rows = fetch_query("SELECT barcode, brand, size, made_in, type, price_wholesale, price_sell, qty FROM products")
                with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
                    writer = csv.writer(f)
                    writer.writerow(["الباركود", "الماركة والصنف", "المقاس", "الصناعة", "النوع", "سعر الجملة", "سعر البيع", "الكمية في المخزن"])
                    
                    t_qty = 0; t_mirror = 0; t_high = 0; t_orig = 0
                    t_whole = 0.0; t_sell = 0.0
                    
                    for row in rows:
                        writer.writerow(row)
                        q = int(row[7])
                        typ = str(row[4]).lower()
                        t_qty += q
                        if 'mirror' in typ: t_mirror += q
                        elif 'high' in typ: t_high += q
                        else: t_orig += q
                        t_whole += float(row[5]) * q
                        t_sell += float(row[6]) * q
                    
                    writer.writerow([])
                    writer.writerow(["", "", "--- إحصائيات المخزن ---", "", "", "", "", ""])
                    writer.writerow(["إجمالي القطع:", t_qty, "قطعة", "", "", "إجمالي الجملة:", f"{t_whole:,.2f}", "ج.م"])
                    writer.writerow(["إجمالي الميرور:", t_mirror, "قطعة", "", "", "إجمالي البيع:", f"{t_sell:,.2f}", "ج.م"])
                    writer.writerow(["إجمالي الهاي كوبي:", t_high, "قطعة"])
                    writer.writerow(["إجمالي الأوريجينال:", t_orig, "قطعة"])

                return {"success": True, "path": filepath}
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "Cancelled"}

    # ================= 3. الفواتير والمرتجعات =================
    def get_invoices(self):
        rows = fetch_query("SELECT id,date,customer,mobile,total FROM sales ORDER BY id DESC")
        return rows

    def get_all_invoices(self):
        rows = fetch_query("SELECT id, date, customer, mobile, total FROM sales ORDER BY id DESC")
        result = []
        for r in rows:
            row_date = r[1]
            try:
                dt = datetime.strptime(row_date, '%Y-%m-%d %H:%M:%S')
                row_date = dt.strftime('%Y-%m-%d %I:%M %p')
            except:
                pass
            result.append({"id": r[0], "date": row_date, "customer": r[2], "mobile": r[3], "total": r[4]})
        return result

    def get_invoice(self, sale_id):
        sale = fetch_query("SELECT id,date,customer,mobile,address,shipping,discount,total,net_profit FROM sales WHERE id=?", (int(sale_id),))
        items = fetch_query("SELECT product_name,price,qty,total FROM sale_items WHERE sale_id=?", (int(sale_id),))
        
        if not sale: return None
        s = sale[0]
        
        formatted_date = s[1]
        try:
            dt = datetime.strptime(formatted_date, '%Y-%m-%d %H:%M:%S')
            formatted_date = dt.strftime('%Y-%m-%d %I:%M %p')
        except:
            pass

        return {
            "id": s[0], "date": formatted_date, "customer": s[2], "mobile": s[3], "address": s[4],
            "shipping": s[5], "discount": s[6], "total": s[7], "profit": s[8],
            "items": [{"name": i[0], "price": i[1], "qty": i[2], "total": i[3]} for i in items]
        }   

    def delete_invoice(self, sale_id):
        items = fetch_query("SELECT product_id, qty FROM sale_items WHERE sale_id=?", (sale_id,))
        for item in items:
            execute_query("UPDATE products SET qty = qty + ? WHERE id = ?", (item[1], item[0]))
        execute_query("DELETE FROM sale_items WHERE sale_id=?", (sale_id,))
        execute_query("DELETE FROM sales WHERE id=?", (sale_id,))
        return {"success": True}

    def export_invoices_excel(self):
        if not self.window: return {"success": False, "error": "Window not found"}
        save_filename = f"RunStore_Invoices_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        result = self.window.create_file_dialog(webview.SAVE_DIALOG, directory='', save_filename=save_filename, file_types=('CSV Files (*.csv)', 'All Files (*.*)'))

        if result:
            filepath = result[0]
            try:
                rows = fetch_query("SELECT id, date, customer, mobile, total, discount, net_profit FROM sales ORDER BY id DESC")
                with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
                    writer = csv.writer(f)
                    writer.writerow(["رقم الفاتورة", "التاريخ", "العميل", "الموبايل", "الإجمالي", "الخصم", "الربح"])
                    for row in rows:
                        writer.writerow(row)
                return {"success": True, "path": filepath}
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "Cancelled"}

    def get_invoice_items(self, sale_id):
        rows = fetch_query("SELECT id, product_name, qty FROM sale_items WHERE sale_id=?", (sale_id,))
        return [{"id": r[0], "product_name": r[1], "qty": r[2]} for r in rows]

    def return_item(self, item_id):
        item = fetch_query("SELECT sale_id, product_id, qty, price FROM sale_items WHERE id=?", (item_id,))
        if not item: return {"success": False}
        sale_id, product_id, qty, price = item[0]
        
        execute_query("UPDATE products SET qty = qty + ? WHERE id = ?", (qty, product_id))
        deduct_amount = qty * price
        execute_query("UPDATE sales SET total = total - ? WHERE id = ?", (deduct_amount, sale_id))
        execute_query("DELETE FROM sale_items WHERE id=?", (item_id,))
        return {"success": True}

    def process_return(self, barcode):
        rows = fetch_query("SELECT id, brand, price_sell, price_wholesale FROM products WHERE barcode=?", (barcode,))
        if not rows: return {"success": False}
        r = rows[0]
        execute_query("UPDATE products SET qty = qty + 1 WHERE id = ?", (r[0],))
        execute_query("INSERT INTO sales (customer, total, net_profit) VALUES (?,?,?)", (f"Return: {r[1]}", -r[2], -(r[2]-r[3])))
        return {"success": True, "refund": r[2]}

    # ================= 4. الإعدادات والباك أب =================
    def authenticate(self, username, password):
        execute_query("CREATE TABLE IF NOT EXISTS users (role TEXT, username TEXT, password TEXT)")
        users = fetch_query("SELECT * FROM users")
        if not users:
            execute_query("INSERT INTO users VALUES ('admin', 'admin', 'admin')")
            execute_query("INSERT INTO users VALUES ('user', 'user', 'user')")
            
        res = fetch_query("SELECT role FROM users WHERE username=? AND password=?", (username, password))
        if res: return {"success": True, "role": res[0][0]}
        return {"success": False}

    def update_credentials(self, role, new_user, new_pass):
        try:
            execute_query("UPDATE users SET username=?, password=? WHERE role=?", (new_user, new_pass, role))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def backup_database(self):
        try:
            db_path = os.path.join(os.path.expanduser("~"), "RunStore_WebPOS.db")
            backup_dir = os.path.join(os.path.expanduser("~"), "RunStore_Backups")
            os.makedirs(backup_dir, exist_ok=True)
            backup_name = f"Manual_Backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
            shutil.copy(db_path, os.path.join(backup_dir, backup_name))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}