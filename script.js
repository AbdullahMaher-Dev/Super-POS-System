let allInvoices = [];
let currentPage = 1;
let perPage = 20;
let cart = [];
let lang = 'en';
let subtotal = 0;
let pyapi = null;
window.userRole = 'admin';
let isPrinting = false; 

// 🔴 متغير لتتبع نوع البحث
window.lastSearchType = 'standard'; 

window.addEventListener('pywebviewready', function () {
    if (window.pywebview) {
        pyapi = window.pywebview.api;
        loadProducts();
        
        let dateInput = document.getElementById("repDate");
        if (dateInput) {
            dateInput.type = "date"; 
            dateInput.style.textAlign = "left";
        }

        // ==========================================
        // 🎨 ألوان زراير البحث الجديدة 
        // ==========================================
        let monthBtnBg = "#0d6efd";   
        let monthBtnText = "#ffffff"; 
        
        let yearBtnBg = "#ffc107";    
        let yearBtnText = "#000000";  
        // ==========================================

        let searchDateBtn = document.querySelector("button[onclick='loadReportsByDate()']");
        if (searchDateBtn && !document.getElementById('repMonth')) {
            let advancedSearchDiv = document.createElement('div');
            advancedSearchDiv.innerHTML = `
                <hr style="border-color: #444; margin: 15px 0 10px 0;">
                <label style="color:#aaa; font-size:12px; margin-bottom:5px; display:block; text-align:left;">Past Reports (Month / Year):</label>
                
                <div style="display: flex; direction: ltr; gap: 5px; margin-bottom: 5px;">
                    <button class="btn" style="background-color: ${monthBtnBg}; color: ${monthBtnText}; font-weight:bold; width: 45%;" onclick="loadReportsByMonth()">Search Month</button>
                    <input type="month" id="repMonth" class="form-control" style="flex: 1; text-align: center; cursor: pointer;">
                </div>
                
                <div style="display: flex; direction: ltr; gap: 5px;">
                    <button class="btn" style="background-color: ${yearBtnBg}; color: ${yearBtnText}; font-weight:bold; width: 45%;" onclick="loadReportsByYear()">Search Year</button>
                    <input type="number" id="repYear" class="form-control" placeholder="e.g. 2026" style="flex: 1; text-align: center;">
                </div>
            `;
            searchDateBtn.parentNode.insertBefore(advancedSearchDiv, searchDateBtn.nextSibling);
        }
        
        let savedRole = sessionStorage.getItem('runstore_role');
        if (savedRole) {
            window.userRole = savedRole;
            document.getElementById('loginScreen').classList.remove('active-screen');
            document.getElementById('mainScreen').style.display = 'flex';
            document.getElementById('mainScreen').classList.add('active-screen');
            
            let savedTab = sessionStorage.getItem('runstore_activeTab') || 'pos';
            switchTab(savedTab);
            
            applyPermissions();
        }
    }
});

async function login() {
    let u = document.getElementById('username').value;
    let p = document.getElementById('password').value;
    if (!window.pywebview) return;
    pyapi = window.pywebview.api;
    let res = await pyapi.authenticate(u, p);
    if (res && res.success) {
        window.userRole = res.role;
        sessionStorage.setItem('runstore_role', res.role); 
        document.getElementById('loginScreen').classList.remove('active-screen');
        document.getElementById('mainScreen').style.display = 'flex';
        document.getElementById('mainScreen').classList.add('active-screen');
        document.getElementById('barcodeScan').focus();
        applyPermissions();
    } else {
        alert("بيانات خاطئة / Invalid Credentials!");
    }
}

function softRefresh() {
    location.reload();
}

function logout() {
    sessionStorage.removeItem('runstore_role');
    sessionStorage.removeItem('runstore_activeTab');
    location.reload();
}

function applyPermissions() {
    let adminElements = document.querySelectorAll('.admin-only');
    if (window.userRole === 'user') {
        adminElements.forEach(el => el.style.display = 'none');
        let pwField = document.getElementById('aPw');
        if (pwField) pwField.value = "0";
    } else {
        adminElements.forEach(el => {
            if (el.tagName === 'BUTTON' || el.classList.contains('d-flex') || el.classList.contains('sum-box')) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'block';
            }
        });
    }
}

async function updateCreds(role) {
    if (!pyapi) return;
    let u = role === 'admin' ? document.getElementById('adminUser').value : document.getElementById('cashierUser').value;
    let p = role === 'admin' ? document.getElementById('adminPass').value : document.getElementById('cashierPass').value;
    if (!u || !p) { alert("Please fill fields!"); return; }
    let res = await pyapi.update_credentials(role, u, p);
    if (res.success) alert("Updated Successfully!");
}

function switchTab(tabId, event) {
    sessionStorage.setItem('runstore_activeTab', tabId); 
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    let targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (event) event.currentTarget.classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) {
            btn.classList.add('active');
        }
    });

    if (tabId === 'inventory') loadInventory();
    if (tabId === 'reports') loadReports();
    if (tabId === 'pos') document.getElementById('barcodeScan').focus();
    if (tabId === 'invoices') loadInvoicesTab();
}

async function handleBarcode(event) {
    if (event.key === 'Enter' && event.target.value !== "") {
        if (!pyapi) return;
        let item = await pyapi.scan_barcode(event.target.value);
        if (item) {
            if (item.qty > 0) addToCart(item.id, item.brand, item.price_sell, item.price_wholesale, item.qty);
            else alert("نفذت الكمية / Out of stock!");
        } else { alert("الباركود غير مسجل / Not found!"); }
        event.target.value = '';
    }
}

function addToCart(id, name, price, wholesale, maxQty) {
    let existingItem = cart.find(i => i.id === id);
    if (existingItem) {
        if (existingItem.qty + 1 > maxQty) {
            alert(`الكمية المطلوبة غير متوفرة في المخزن! المتاح: ${maxQty}`);
            return;
        }
        existingItem.qty += 1;
    } else {
        if (maxQty < 1) {
            alert("المنتج غير متوفر!");
            return;
        }
        cart.push({ id, name, price, wholesale, qty: 1, maxQty: maxQty });
    }
    renderCart();
}

function changeQty(index, amount) {
    let newQty = cart[index].qty + amount;
    if (amount > 0 && newQty > cart[index].maxQty) {
        alert(`الكمية المطلوبة غير متوفرة! المتاح فقط: ${cart[index].maxQty}`);
        return;
    }
    if (newQty > 0) {
        cart[index].qty = newQty;
    } else {
        cart.splice(index, 1);
    }
    renderCart();
}

function renderCart() {
    let tbody = document.getElementById('cartTable');
    let html = '';
    subtotal = 0; let totalWholesale = 0;

    cart.forEach((i, index) => {
        let itemTotal = i.price * i.qty;
        subtotal += itemTotal;
        totalWholesale += (i.wholesale * i.qty);
        html += `<tr>
            <td class="text-start fw-bold" style="font-size: 0.85rem;">${i.name}</td>
            <td class="text-center fw-bold text-primary">
                <button class="btn btn-sm btn-outline-secondary px-2 py-0 me-1" onclick="changeQty(${index}, -1)">-</button>
                ${i.qty}
                <button class="btn btn-sm btn-outline-secondary px-2 py-0 ms-1" onclick="changeQty(${index}, 1)">+</button>
            </td>
            <td class="text-center">${i.price}</td><td class="text-center fw-bold">${itemTotal}</td>
            <td class="text-center"><button class="btn btn-sm btn-danger py-0 px-2" onclick="cart.splice(${index},1);renderCart();">❌</button></td>
        </tr>`;
    });
    tbody.innerHTML = html;

    let shipElem = document.getElementById('cGovPrice');
    let ship = shipElem && shipElem.value !== "" ? parseFloat(shipElem.value) : 0;
    let disc = parseFloat(document.getElementById('cDisc').value) || 0;
    let total = subtotal + ship - disc;

    window.currentNetProfit = (subtotal - totalWholesale) - disc;
    document.getElementById('totalAmount').innerText = total.toFixed(2);
    document.getElementById("itemsCount").innerText = "Items: " + cart.reduce((t, i) => t + i.qty, 0);
    
    let profitBox = document.getElementById('profitBox');
    if (window.userRole === 'admin' && profitBox) profitBox.innerText = "Profit: " + window.currentNetProfit.toFixed(2) + " L.E";
}

function clearCart() {
    cart = [];
    document.getElementById('cName').value = '';
    document.getElementById('cMob').value = '';
    document.getElementById('cAdd').value = '';
    document.getElementById('cDisc').value = '0';
    let govPrice = document.getElementById('cGovPrice');
    if (govPrice) govPrice.value = '';
    let govSel = document.getElementById('cGovSelect');
    if (govSel) govSel.value = '0';
    renderCart();
    document.getElementById('barcodeScan').focus();
}

const columnColors = ['#7a1f24', '#0d6efd', '#198754'];

async function loadProducts() {
    if (!pyapi) return;
    let prods = await pyapi.get_all_products();
    let grid = document.getElementById('productsGrid');
    let html = '';

    prods.forEach((p, index) => {
        let color = columnColors[index % 3];
        let disabled = p.qty <= 0 ? 'disabled' : '';

        html += `
            <div class="col-4 mb-2">
                <button class="prod-card d-flex flex-column justify-content-center align-items-center"
                data-barcode="${p.barcode}"
                style="background-color: ${color} !important; padding: 10px; height: 100px; border-radius: 12px; border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%;" ${disabled}
                onclick="addToCart(${p.id}, '${p.brand}', ${p.price_sell}, ${p.price_wholesale}, ${p.qty})">
                    <div class="text-truncate w-100" style="font-size: 1.15rem; font-weight: 900; color: white; line-height: 1.3;">
                        ${p.brand} ${p.size ? '- ' + p.size : ''}
                    </div>
                    <div class="fw-bold text-white my-1" style="font-size: 1.4rem; line-height: 1;">
                        ${p.price_sell} L.E
                    </div>
                    <div style="color: ${p.qty <= 0 ? '#ffcccc' : '#e2e8f0'} !important; font-weight: 900; font-size: 1rem; line-height: 1;">
                        ${p.qty <= 0 ? 'Out of Stock' : 'Stock: ' + p.qty}
                    </div>
                </button>
            </div>`;
    });
    grid.innerHTML = html;
}

function searchProducts(q) {
    q = q.toLowerCase().trim();
    document.querySelectorAll("#productsGrid button").forEach(b => {
        let text = b.innerText.toLowerCase();
        let barcode = b.getAttribute("data-barcode") ? b.getAttribute("data-barcode").toLowerCase() : "";
        if (text.includes(q) || barcode.includes(q)) b.parentElement.style.display = "block";
        else b.parentElement.style.display = "none";
    });
}

async function executePrint(htmlContent, type) {
    if (isPrinting) return;
    isPrinting = true;

    try {
        let statusOverlay = document.getElementById('printStatusOverlay');
        if (!statusOverlay) {
            statusOverlay = document.createElement('div');
            statusOverlay.id = 'printStatusOverlay';
            statusOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);color:#fff;z-index:99999;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:bold;font-family:Arial,sans-serif; flex-direction: column;';
            document.body.appendChild(statusOverlay);
        }
        statusOverlay.innerHTML = `<i class="fas fa-print fa-bounce mb-3" style="font-size: 3rem; color: #3B82F6;"></i> <div>جاري الطباعة.....</div>`;
        statusOverlay.style.display = 'flex';

        let printerName = type === 'receipt' ? 'receipt' : 'barcode';
        if (pyapi) await pyapi.set_active_printer(printerName);

        await new Promise(r => setTimeout(r, 2000));

        let frameId = 'printFrame_' + new Date().getTime();
        let iframe = document.createElement('iframe');
        iframe.id = frameId;
        iframe.style.position = 'absolute';
        iframe.style.top = '-10000px';
        iframe.style.left = '-10000px';
        document.body.appendChild(iframe);

        let doc = iframe.contentWindow.document;
        let width = type === 'receipt' ? '80mm' : '38mm';
        let height = type === 'receipt' ? 'auto' : '25mm'; 
        let padding = type === 'receipt' ? '25mm 5mm 10mm 5mm' : '0px';

        let style = '';
        if (type === 'receipt') {
            style = `
                @page { size: ${width} ${height}; margin: 0 !important; }
                body { margin: 0 !important; padding: 0 !important; font-family: 'Courier New', monospace; color: black; background: white; width: ${width}; display: flex; justify-content: center; }
                * { color: black !important; font-weight: bold; box-sizing: border-box; }
                .receipt-container { width: 78mm; padding: ${padding}; margin: 0 auto; overflow: hidden; }
                .items { width: 100%; border-collapse: collapse; margin: 10px 0; }
                .items th { border-top: 2px dashed black; border-bottom: 2px dashed black; padding: 6px 2px; font-size: 13px; text-align: center; }
                .items td { border-bottom: 1px dashed #ccc; padding: 6px 2px; font-size: 13px; text-align: center; }
                .items td:first-child { text-align: left; }
                .items td:last-child { text-align: right; }
                .sum-box, .invoice-summary { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; border: none; }
                .total-box { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; padding: 8px 0; margin-top: 5px; border-top: 2px dashed black; border-bottom: 2px dashed black; }
                .text-center { text-align: center; }
                .text-start { text-align: left; }
                .text-end { text-align: right; }
            `;
        } else {
            style = `
                @page { size: ${width} ${height}; margin: 0 !important; padding: 0 !important; }
                body { margin: 0 !important; padding: 0 !important; width: ${width}; height: ${height}; overflow: hidden !important; background: white; display: flex; align-items: center; justify-content: center; }
                * { color: black !important; box-sizing: border-box !important; }
                .barcode-wrapper { 
                    width: 38mm; 
                    height: 25mm; 
                    padding-left: 2.5mm; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    justify-content: center; 
                    overflow: hidden !important; 
                }
                svg { display: block; margin: 0; }
            `;
        }

        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head><style>${style}</style></head>
            <body>
                <div class="${type === 'receipt' ? 'receipt-container' : 'barcode-wrapper'}">
                    ${htmlContent}
                </div>
            </body>
            </html>
        `);
        doc.close();

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print(); 

            setTimeout(() => {
                iframe.src = 'about:blank';
                iframe.remove();
                statusOverlay.style.display = 'none';
                isPrinting = false;

                if (type === 'barcode') {
                    softRefresh();
                } else if (type === 'receipt' && document.getElementById('receiptModal').style.display === 'block') {
                    closeReceipt();
                }
            }, 800); 
        }, 300);

    } catch (e) {
        alert("حدث خطأ أثناء الطباعة: " + e);
        document.getElementById('printStatusOverlay').style.display = 'none';
        isPrinting = false;
    }
}

async function printSticker(code, brand, price) {
    if (isPrinting) return;

    const area = document.getElementById('barcodePrintArea');
    
    area.innerHTML = `
        <div style="font-size: 12.5px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 1px; text-align: center; width: 100%;">RUN STORE</div>
        <div style="font-size: 10.5px; font-weight: 900; margin-bottom: 2px; white-space: nowrap; overflow: hidden; max-width: 34mm; text-align: center; width: 100%;">${brand}</div>
        <svg id="bSvg" style="margin: 0; display: block;"></svg>
        <div style="font-size: 12.5px; font-weight: 900; letter-spacing: 0.5px; margin-top: 1px; text-align: center; width: 100%;">${price} L.E</div>
    `;

    JsBarcode("#bSvg", code, { 
        format: "CODE128", 
        width: 1.1, 
        height: 22, 
        displayValue: true, 
        fontSize: 10, 
        fontOptions: "bold", 
        font: "'Courier New', monospace",
        margin: 0,
        textMargin: 1
    });

    setTimeout(async () => {
        let content = area.innerHTML;
        await executePrint(content, 'barcode');
    }, 100);
}

async function previewReceipt() {
    if (isPrinting) return; 
    if (cart.length === 0) { alert("Cart is empty"); return; }

    try {
        let total = parseFloat(document.getElementById('totalAmount').innerText);
        let disc = parseFloat(document.getElementById('cDisc').value) || 0;
        let shipElem = document.getElementById('cGovPrice');
        let ship = shipElem && shipElem.value !== "" ? parseFloat(shipElem.value) : 0;
        let net = window.currentNetProfit || 0;
        
        let govSel = document.getElementById('cGovSelect');
        let finalCity = "بدون شحن";
        if (govSel && govSel.options[govSel.selectedIndex] && govSel.options[govSel.selectedIndex].value !== "0") {
            finalCity = govSel.options[govSel.selectedIndex].text; 
        } else if (ship > 0) {
            finalCity = "Shipping"; 
        }

        let sale = null;
        if (pyapi) {
            sale = await pyapi.save_sale(
                document.getElementById('cName').value || "Walk-in Customer",
                document.getElementById('cMob').value,
                document.getElementById('cAdd').value,
                finalCity, 
                ship, disc, total, net, cart
            );
        }

        document.getElementById('rId').innerText = sale ? sale.sale_id : "---";
        document.getElementById('rCust').innerText = document.getElementById('cName').value || "Walk-in Customer";
        
        let cMob = document.getElementById('cMob').value;
        let cAdd = document.getElementById('cAdd').value;
        document.getElementById('rMob').innerText = cMob ? "Mob: " + cMob : "";
        document.getElementById('rAdd').innerText = cAdd ? "Add: " + cAdd : "";
        document.getElementById('rMob').style.display = cMob ? 'block' : 'none';
        document.getElementById('rAdd').style.display = cAdd ? 'block' : 'none';
        
        let now = new Date();
        document.getElementById('rDate').innerText = now.toLocaleString('en-US', { hour12: true });

        let itemsHtml = "";
        cart.forEach(i => {
            let t = (Number(i.price) * Number(i.qty)).toFixed(2);
            itemsHtml += `<tr><td class="text-start">${i.name}</td><td class="text-center">${i.qty}</td><td class="text-center">${i.price}</td><td class="text-end">${t}</td></tr>`;
        });
        document.getElementById('rItems').innerHTML = itemsHtml;
        document.getElementById('rShip').innerText = ship.toFixed(2) + " L.E";
        document.getElementById('rDisc').innerText = disc.toFixed(2) + " L.E";
        document.getElementById('rTotal').innerText = total.toFixed(2) + " L.E";

        let profitRow = document.getElementById('rProfit');
        if (profitRow && profitRow.parentElement) {
            profitRow.parentElement.style.display = "none";
        }

        document.getElementById('receiptModal').style.display = 'block';
        
        let content = document.getElementById('receiptContent').innerHTML;
        await executePrint(content, 'receipt');

    } catch (e) {
        alert("Error saving sale");
    }
}

function closeReceipt() {
    document.getElementById('receiptModal').style.display = 'none';
    clearCart();
    loadProducts();
}

async function saveProduct() {
    if (!pyapi) return;
    let bar = document.getElementById('aBar').value.trim();
    let brand = document.getElementById('aBrand').value.trim();
    let size = document.getElementById('aSize').value.trim();
    let made = document.getElementById('aMade').value.trim();
    let type = document.getElementById('aType').value;
    let pwElem = document.getElementById('aPw');
    let pw = pwElem ? pwElem.value : "0";
    let ps = document.getElementById('aPs').value;
    let qty = document.getElementById('aQty').value;

    if (window.userRole === 'user') pw = "0";
    if (!brand || !ps || !qty) { alert("يرجى إدخال المواصفات الأساسية!"); return; }

    let res = await pyapi.add_product(bar, brand, size, made, type, pw, ps, qty);
    if (res.success) {
        alert("Products Saved!");
        ['aBar', 'aBrand', 'aSize', 'aMade', 'aPw', 'aPs', 'aQty'].forEach(id => { let e = document.getElementById(id); if (e) e.value = ''; });
        loadInventory(); loadProducts();
    } else { alert("Error: " + res.error); }
}

async function loadInventory() {
    if (!pyapi) return;
    let prods = await pyapi.get_all_products();
    let tb = document.getElementById('invTable');
    let html = '';
    prods.forEach(p => {
        let deleteBtn = window.userRole === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteProd(${p.id})"><i class="fas fa-trash"></i></button>` : '';
        html += `<tr>
            <td>${p.barcode}</td><td>${p.brand}</td><td>${p.size}</td><td>${p.type}</td><td>${p.price_sell}</td><td>${p.qty}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-dark" onclick="printSticker('${p.barcode}', '${p.brand}', ${p.price_sell})"><i class="fas fa-barcode"></i></button>
                <button class="btn btn-sm btn-warning" onclick="editProd(${p.id}, ${p.price_sell}, ${p.qty})"><i class="fas fa-edit"></i></button>
                ${deleteBtn}
            </td>
        </tr>`;
    });
    tb.innerHTML = html;
}

async function editProd(id, currentPrice, currentQty) {
    let newPrice = prompt("Enter new sell price:", currentPrice);
    let newQty = prompt("Enter new quantity:", currentQty);
    if (newPrice !== null && newQty !== null && pyapi) {
        let res = await pyapi.update_product(id, parseFloat(newPrice), parseInt(newQty));
        if (res.success) { loadInventory(); loadProducts(); } else { alert("Error updating!"); }
    }
}

async function deleteProd(id) {
    if (confirm("Are you sure?") && pyapi) { await pyapi.delete_product(id); loadInventory(); loadProducts(); }
}

// 🔴 الدالة القديمة للتقارير الثابتة
async function loadReports() {
    window.lastSearchType = 'standard'; 
    if (!pyapi) return;
    let r = await pyapi.get_reports(document.getElementById('repTime').value);
    document.getElementById('sWholesale').innerText = r.wholesale.toFixed(2);
    document.getElementById('sSell').innerText = r.sell.toFixed(2);
    document.getElementById('sNet').innerText = r.net.toFixed(2);
    let tb = document.getElementById('repTable');
    let html = '';
    r.sales_list.forEach(s => {
        html += `<tr><td>${s[0]}</td><td>${s[1]}</td><td>${s[2]}</td><td>${s[4]}</td><td class="fw-bold text-success">${s[5]}</td><td>${s[6]}</td></tr>`;
    });
    tb.innerHTML = html;
}

// 🔴 دوال البحث المخصص (اليوم، الشهر، السنة)
async function loadReportsByDate() {
    if (!pyapi) return;
    let dateVal = document.getElementById("repDate").value; 
    if (!dateVal) { alert("يرجى اختيار يوم / Please select a date"); return; }
    await fetchAndFilterReports(dateVal, 'day');
}

async function loadReportsByMonth() {
    if (!pyapi) return;
    let monthVal = document.getElementById("repMonth").value; 
    if (!monthVal) { alert("يرجى اختيار شهر / Please select a month"); return; }
    await fetchAndFilterReports(monthVal, 'month');
}

async function loadReportsByYear() {
    if (!pyapi) return;
    let yearVal = document.getElementById("repYear").value; 
    if (!yearVal) { alert("يرجى كتابة سنة / Please enter a year"); return; }
    await fetchAndFilterReports(yearVal, 'year');
}

// 🔴 المحرك الذكي (تم حل مشكلة الـ NaN بجمع العمود رقم 5 اللي فيه الفلوس)
async function fetchAndFilterReports(searchValue, type) {
    window.lastSearchType = 'custom'; 
    let tb = document.getElementById('repTable');
    tb.innerHTML = '<tr><td colspan="6" class="text-center fw-bold">جاري تحميل البيانات...</td></tr>';

    let allData = null;
    try { allData = await pyapi.get_reports('all'); } catch(e){}

    if (!allData || !allData.sales_list) {
        tb.innerHTML = '<tr><td colspan="6" class="text-center text-danger fw-bold">خطأ في جلب البيانات من قاعدة البيانات</td></tr>';
        return;
    }

    let filteredSales = [];
    
    if (type === 'day') {
        filteredSales = allData.sales_list.filter(s => String(s[0]).includes(searchValue));
    } 
    else if (type === 'month') {
        let parts = searchValue.split('-'); // 2026-03
        let y = parts[0], m = parts[1], mNoZero = parseInt(m).toString();
        filteredSales = allData.sales_list.filter(s => {
            let dateStr = String(s[0]);
            return dateStr.includes(`${y}-${m}`) || dateStr.includes(`${m}/${y}`) || dateStr.includes(`${mNoZero}/${y}`);
        });
    } 
    else if (type === 'year') {
        filteredSales = allData.sales_list.filter(s => String(s[0]).includes(searchValue));
    }

    let html = '';
    let calculatedSales = 0;

    if (filteredSales.length > 0) {
        filteredSales.forEach(s => {
            // 🔴 تم التعديل: تجميع العمود رقم 5 (TOTAL) مش رقم 4 اللي فيه اسم المدينة
            let rowTotal = parseFloat(s[5]); 
            if (!isNaN(rowTotal)) {
                calculatedSales += rowTotal;
            }
            
            html += `<tr>
                <td>${s[0]}</td><td>${s[1]}</td><td>${s[2]}</td><td>${s[4]}</td><td class="fw-bold text-success">${s[5]}</td><td>${s[6]}</td>
            </tr>`;
        });
    } else {
        html = '<tr><td colspan="6" class="text-center fw-bold">لا توجد مبيعات في هذا التاريخ / No sales found</td></tr>';
    }

    // محاولة جلب الأرقام الدقيقة من البايثون
    let finalWholesale = null, finalNet = null, finalSell = calculatedSales;
    try {
        let r = await pyapi.get_reports_by_date(searchValue);
        if (r && r.sell !== undefined && r.sell > 0) {
            finalWholesale = r.wholesale;
            finalSell = r.sell;
            finalNet = r.net;
        }
    } catch(e){}

    // 🔴 تم إزالة NaN: لو البايثون معرفش يجيب التكلفة والمكسب للتاريخ ده، هيحط خطوط (---) ويعرض المبيعات الدقيقة اللي حسبناها من الجدول
    document.getElementById('sWholesale').innerText = finalWholesale !== null ? finalWholesale.toFixed(2) : "---";
    document.getElementById('sSell').innerText = finalSell.toFixed(2);
    document.getElementById('sNet').innerText = finalNet !== null ? finalNet.toFixed(2) : "---";
    
    tb.innerHTML = html;
}

// ================================================================
// 🔴 دالة تصدير الإكسيل (تم حل مشكلة مربع الـ Save As)
// ================================================================
async function exportReports() {
    // 1. لو البحث قياسي (اليوم، الشهر، الخ) هيستخدم كود البايثون اللي بيفتحلك مربع Save As العادي
    if (window.lastSearchType === 'standard') {
        if (!pyapi) return;
        let res = await pyapi.export_reports_excel(document.getElementById('repTime').value);
        if (res && res.success) {
            alert("تم التصدير بنجاح: " + res.path);
        }
    } 
    // 2. لو البحث مخصص، هنستخدم تقنية showSaveFilePicker عشان نجبر الويندوز يفتحلك مربع Save As تختار منه المكان!
    else {
        let dateVal = document.getElementById('repDate') ? document.getElementById('repDate').value : 'Report';
        let filename = `Custom_Report_${dateVal}.csv`;

        let csv = [];
        csv.push("Sales Summary / ملخص المبيعات");
        let w = document.getElementById('sWholesale') ? document.getElementById('sWholesale').innerText : '0';
        let s = document.getElementById('sSell') ? document.getElementById('sSell').innerText : '0';
        let n = document.getElementById('sNet') ? document.getElementById('sNet').innerText : '0';
        
        csv.push(`Total Wholesale (إجمالي التكلفة),${w}`);
        csv.push(`Total Sales (إجمالي المبيعات),${s}`);
        csv.push(`Net Profit (صافي الربح),${n}`);
        csv.push(""); 
        csv.push("Date,Customer,Mobile,City,Total,Discount"); 
        
        let rows = document.querySelectorAll("#repTable tr");
        if (rows.length === 0 || (rows.length === 1 && rows[0].innerText.includes("No sales"))) {
            alert("لا توجد بيانات لتصديرها! / No data to export");
            return;
        }

        for (let i = 0; i < rows.length; i++) {
            let row = [], cols = rows[i].querySelectorAll("td, th");
            for (let j = 0; j < cols.length; j++) {
                let cellData = cols[j].innerText.replace(/"/g, '""');
                row.push('"' + cellData + '"');
            }
            csv.push(row.join(","));
        }

        let csvContent = "\uFEFF" + csv.join("\n");

        // 🔴 هنا السحر: استدعاء مربع حفظ الويندوز الأصلي (Save As)
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'CSV File',
                        accept: {'text/csv': ['.csv']},
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(csvContent);
                await writable.close();
                alert("تم التصدير بنجاح!");
                return; // لو نجحت نوقف الدالة هنا
            }
        } catch (err) {
            if (err.name === 'AbortError') return; // لو إنت قفلت المربع كنسلت الحفظ
        }

        // 🔴 بديل لو المتصفح قديم ومش بيدعم المربع: هينزلها في التنزيلات ويطلعلك تنبيه واضح
        let csvFile = new Blob([csvContent], {type: "text/csv;charset=utf-8;"});
        let downloadLink = document.createElement("a");
        downloadLink.download = filename;
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.style.display = "none";
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        alert("تم التصدير بنجاح!\n\n(تم حفظ الملف في مجلد التنزيلات Downloads نظراً لقيود النظام).");
    }
}

async function exportInventoryExcel() {
    if (!pyapi) return;
    let res = await pyapi.export_inventory_excel();
    if (res.success) alert("تم التصدير بنجاح: " + res.path);
}

function loadInvoicesTab() {
    if(!pyapi) return;
    pyapi.get_all_invoices().then(data => {
        allInvoices = data;
        currentPage = 1;
        renderInvoices();
    });
}

function renderInvoices() {
    let table = document.getElementById("invoiceTable");
    let html = "";
    let start = (currentPage - 1) * perPage;
    let end = start + perPage;
    let pageData = allInvoices.slice(start, end);
    pageData.forEach(inv => {
        html += `<tr><td>${inv.id}</td><td>${inv.date}</td><td>${inv.customer}</td><td>${inv.mobile}</td><td>${inv.total}</td>
        <td>
            <button class="btn btn-sm btn-info" onclick="openInvoice(${inv.id})"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-dark" onclick="reprintInvoice(${inv.id})"><i class="fas fa-print"></i></button>
            <button class="btn btn-sm btn-danger admin-only" onclick="deleteInvoice(${inv.id})"><i class="fas fa-trash"></i></button>
        </td></tr>`;
    });
    table.innerHTML = html;
    let info = document.getElementById("pageInfo");
    if (info) info.innerText = "Page " + currentPage + " / " + Math.ceil(allInvoices.length / perPage);
}

function nextPage() { if (currentPage < Math.ceil(allInvoices.length / perPage)) { currentPage++; renderInvoices(); } }
function prevPage() { if (currentPage > 1) { currentPage--; renderInvoices(); } }
function sortInvoices() { allInvoices.sort((a, b) => new Date(b.date) - new Date(a.date)); renderInvoices(); }

async function openInvoice(id) {
    if (!pyapi) return;
    let sale = await pyapi.get_invoice(id);
    if (!sale) return;

    document.getElementById('rId').innerText = sale.id;
    document.getElementById('rDate').innerText = sale.date;
    document.getElementById('rCust').innerText = sale.customer || "Walk-in Customer";
    document.getElementById('rMob').innerText = sale.mobile ? "Mob: " + sale.mobile : "";
    document.getElementById('rAdd').innerText = sale.address ? "Add: " + sale.address : "";
    document.getElementById('rMob').style.display = sale.mobile ? 'block' : 'none';
    document.getElementById('rAdd').style.display = sale.address ? 'block' : 'none';
    document.getElementById('rShip').innerText = Number(sale.shipping).toFixed(2) + " L.E";
    document.getElementById('rDisc').innerText = Number(sale.discount).toFixed(2) + " L.E";
    document.getElementById('rTotal').innerText = Number(sale.total).toFixed(2) + " L.E";

    let profitRow = document.getElementById('rProfit');
    if (window.userRole === "admin" && profitRow) {
        profitRow.innerText = Number(sale.profit).toFixed(2) + " L.E";
        profitRow.parentElement.style.display = "flex";
    } else if (profitRow) {
        profitRow.parentElement.style.display = "none";
    }

    let html = "";
    if (sale.items && sale.items.length > 0) {
        sale.items.forEach(i => {
            html += `<tr><td class="text-start">${i.name}</td><td class="text-center">${i.qty}</td><td class="text-center">${Number(i.price).toFixed(2)}</td><td class="text-end">${Number(i.total).toFixed(2)}</td></tr>`;
        });
    } else {
        html = `<tr><td colspan="4" class="text-center">No Items Found</td></tr>`;
    }
    
    document.getElementById('rItems').innerHTML = html;
    document.getElementById('receiptModal').style.display = "block";
}

async function reprintInvoice(id) {
    if (isPrinting) return;
    await openInvoice(id);
    let content = document.getElementById('receiptContent').innerHTML;
    await executePrint(content, 'receipt');
}

function searchInvoice(q) {
    q = q.toLowerCase();
    document.querySelectorAll("#invoiceTable tr").forEach(row => {
        let invoice = row.children[0].innerText.toLowerCase();
        let mobile = row.children[3].innerText.toLowerCase();
        if (invoice.includes(q) || mobile.includes(q)) row.style.display = "";
        else row.style.display = "none";
    });
}

function filterInvoicesByDate(date) {
    if (!date) { renderInvoices(); return; }
    let filtered = allInvoices.filter(i => i.date.startsWith(date));
    let table = document.getElementById("invoiceTable");
    let html = "";
    filtered.forEach(inv => {
        html += `<tr><td>${inv.id}</td><td>${inv.date}</td><td>${inv.customer}</td><td>${inv.mobile}</td><td>${inv.total}</td>
        <td>
            <button class="btn btn-sm btn-info" onclick="openInvoice(${inv.id})"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-dark" onclick="reprintInvoice(${inv.id})"><i class="fas fa-print"></i></button>
            <button class="btn btn-sm btn-danger admin-only" onclick="deleteInvoice(${inv.id})"><i class="fas fa-trash"></i></button>
        </td></tr>`;
    });
    table.innerHTML = html;
}

async function deleteInvoice(id) {
    if (!confirm("Delete this invoice?")) return;
    await pyapi.delete_invoice(id);
    loadInvoicesTab();
    loadProducts();
}

async function exportInvoicesExcel() {
    let res = await pyapi.export_invoices_excel();
    if (res.success) alert("Exported: " + res.path);
}

async function handleReturnBarcode(event) {
    if (event.key === "Enter") {
        let code = event.target.value;
        if (!code) return;
        let res = await pyapi.process_return(code);
        if (res.success) {
            alert("Returned ✔ Refund: " + res.refund + " L.E");
            event.target.value = "";
            loadProducts();
        } else { alert("Product Not Found!"); }
    }
}

async function processReturn() {
    if (!pyapi) return;
    let code = document.getElementById('retScan').value;
    let res = await pyapi.process_return(code);
    if (res.success) { alert("Return Processed! Refund: " + res.refund); document.getElementById('retScan').value = ''; loadProducts(); }
    else { alert("Product Not Found!"); }
}

async function loadReturnItems() {
    let id = document.getElementById("retInvoice").value;
    let items = await pyapi.get_invoice_items(id);
    let tb = document.getElementById("returnTable");
    let html = "";
    items.forEach(i => {
        html += `<tr><td>${i.product_name}</td><td>${i.qty}</td><td><button class="btn btn-danger" onclick="returnItem(${i.id})">Return</button></td></tr>`;
    });
    tb.innerHTML = html;
}

async function returnItem(itemId) {
    if (!confirm("Are you sure?")) return;
    if (!pyapi) return;
    let res = await pyapi.return_item(itemId);
    if (res.success) {
        alert("Item returned successfully!");
        loadReturnItems(); 
        loadProducts(); 
    }
}

async function backupDatabase() {
    if (!pyapi) return;
    let r = await pyapi.backup_database();
    if (r.success) alert("Backup Created Successfully!");
}

function toggleTheme() {
    let root = document.documentElement; let isDark = root.getAttribute('data-theme') === 'dark';
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('themeBtn').innerHTML = isDark ? '<i class="fas fa-moon"></i> <span>Dark</span>' : '<i class="fas fa-sun"></i> <span>Light</span>';
}

function toggleLang() {
    lang = lang === 'ar' ? 'en' : 'ar';
    document.body.classList.toggle("rtl", lang === "ar");
    document.getElementById('bs-css').href = lang === 'ar' ? "css/bootstrap.rtl.min.css" : "css/bootstrap.min.css";
    document.querySelectorAll('[data-en]').forEach(el => el.innerText = el.getAttribute(`data-${lang}`));
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        if (document.getElementById('loginScreen').classList.contains('active-screen')) login();
    }
    if (e.key === "F1") { e.preventDefault(); switchTab('pos'); }
    if (e.key === "F2") { e.preventDefault(); switchTab('inventory'); }
    if (e.key === "F3") { e.preventDefault(); switchTab('reports'); }
    if (e.key === "F4") { e.preventDefault(); switchTab('returns'); }
    if (e.key === "F5") { e.preventDefault(); switchTab('invoices'); }
});