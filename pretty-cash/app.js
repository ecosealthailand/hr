/**
 * Ecoseal Petty Cash Management System - Application Logic
 * Pure client-side JavaScript implementing CRUD, Auto-Calculations, 
 * Google Sheets API Synchronization, and Print/PDF formatting.
 */

// Application State
let vouchers = [];
let googleScriptUrl = localStorage.getItem('ecoseal_sheet_url') || '';
let currentVoucherId = null; // null means new voucher
const DEFAULT_ROW_COUNT = 10; // Match physical PDF form rows exactly

// Elements Cache
const el = {
    // Views
    dashboardView: document.getElementById('dashboardView'),
    formView: document.getElementById('formView'),
    settingsModal: document.getElementById('settingsModal'),
    
    // Header & Actions
    syncStatus: document.getElementById('syncStatus'),
    syncStatusText: document.getElementById('syncStatusText'),
    btnOpenSettings: document.getElementById('btnOpenSettings'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnCreateNew: document.getElementById('btnCreateNew'),
    btnBackToDashboard: document.getElementById('btnBackToDashboard'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    btnTestConnection: document.getElementById('btnTestConnection'),
    testConnSpinner: document.getElementById('testConnSpinner'),
    btnCopyCode: document.getElementById('btnCopyCode'),
    toast: document.getElementById('toast'),
    
    // Filters
    filterSearch: document.getElementById('filterSearch'),
    filterType: document.getElementById('filterType'),
    filterStatus: document.getElementById('filterStatus'),
    filterDate: document.getElementById('filterDate'),
    recordCount: document.getElementById('recordCount'),
    recordsTableBody: document.getElementById('recordsTableBody'),
    
    // Stats
    statTotalAmount: document.getElementById('statTotalAmount'),
    statPendingCount: document.getElementById('statPendingCount'),
    statApprovedCount: document.getElementById('statApprovedCount'),
    statPaidCount: document.getElementById('statPaidCount'),
    
    // Settings Form
    settingsSheetUrl: document.getElementById('settingsSheetUrl'),
    
    // Voucher Form Inputs
    voucherNo: document.getElementById('voucherNo'),
    voucherDate: document.getElementById('voucherDate'),
    voucherRequestBy: document.getElementById('voucherRequestBy'),
    voucherDepartment: document.getElementById('voucherDepartment'),
    voucherDuePayment: document.getElementById('voucherDuePayment'),
    voucherDateRequire: document.getElementById('voucherDateRequire'),
    voucherPayCheck: document.getElementById('voucherPayCheck'),
    voucherRemark: document.getElementById('voucherRemark'),
    voucherSupplier: document.getElementById('voucherSupplier'),
    voucherReason: document.getElementById('voucherReason'),
    vatToggle: document.getElementById('vatToggle'),
    subTotalDisplay: document.getElementById('subTotalDisplay'),
    vatDisplay: document.getElementById('vatDisplay'),
    grandTotalDisplay: document.getElementById('grandTotalDisplay'),
    voucherStatus: null,
    
    // Signatures
    signRequestBy: document.getElementById('signRequestBy'),
    signRequestDate: document.getElementById('signRequestDate'),
    signDepApprove: document.getElementById('signDepApprove'),
    signDepApproveDate: document.getElementById('signDepApproveDate'),
    signMd: document.getElementById('signMd'),
    signMdDate: document.getElementById('signMdDate'),
    signFinance: document.getElementById('signFinance'),
    signFinanceDate: document.getElementById('signFinanceDate'),
    signReceivedBy: document.getElementById('signReceivedBy'),
    signReceivedDate: document.getElementById('signReceivedDate'),
    signPaidBy: document.getElementById('signPaidBy'),
    signPaidDate: document.getElementById('signPaidDate'),
    
    // Form buttons
    itemsTableBody: document.getElementById('itemsTableBody'),
    btnAddRow: document.getElementById('btnAddRow'),
    btnSaveVoucher: document.getElementById('btnSaveVoucher'),
    btnPrintVoucher: document.getElementById('btnPrintVoucher'),
    btnDeleteCurrent: document.getElementById('btnDeleteCurrent')
};

// Start Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

// Initialize Settings and Load Data
function initApp() {
    el.settingsSheetUrl.value = googleScriptUrl;
    updateSyncStatusIndicator();
    
    // Pre-load backup vouchers from localStorage
    const saved = localStorage.getItem('ecoseal_vouchers');
    if (saved) {
        vouchers = JSON.parse(saved);
    }
    
    // Pull fresh data from Google Sheet if URL exists, else render localStorage backup
    fetchVouchersFromCloud();
}

// Update UI Sync State Indicator
function updateSyncStatusIndicator() {
    if (googleScriptUrl) {
        el.syncStatus.className = 'sync-status text-success';
        el.syncStatus.innerHTML = '<i class="fa-solid fa-cloud"></i> <span>Cloud Sync Enabled</span>';
        el.syncStatusText = el.syncStatus.querySelector('span');
    } else {
        el.syncStatus.className = 'sync-status text-warning';
        el.syncStatus.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span>Local Mode</span>';
        el.syncStatusText = el.syncStatus.querySelector('span');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Navigating views
    el.btnCreateNew.addEventListener('click', () => openVoucherForm(null));
    el.btnBackToDashboard.addEventListener('click', showDashboard);
    
    // Settings Modal
    el.btnOpenSettings.addEventListener('click', () => el.settingsModal.classList.add('open'));
    el.btnCloseSettings.addEventListener('click', () => el.settingsModal.classList.remove('open'));
    el.settingsModal.addEventListener('click', (e) => {
        if (e.target === el.settingsModal) el.settingsModal.classList.remove('open');
    });
    
    // Save Settings
    el.btnSaveSettings.addEventListener('click', () => {
        googleScriptUrl = el.settingsSheetUrl.value.trim();
        localStorage.setItem('ecoseal_sheet_url', googleScriptUrl);
        updateSyncStatusIndicator();
        el.settingsModal.classList.remove('open');
        showToast('Settings saved successfully!');
        fetchVouchersFromCloud();
    });
    
    // Test Connection
    el.btnTestConnection.addEventListener('click', testGoogleSheetsConnection);
    
    // Copy apps script code
    el.btnCopyCode.addEventListener('click', () => {
        const codeElement = document.getElementById('appsScriptCode');
        navigator.clipboard.writeText(codeElement.innerText);
        showToast('Apps Script code copied to clipboard!');
    });
    
    // Form items table interactions
    el.btnAddRow.addEventListener('click', () => addVoucherRow());
    el.vatToggle.addEventListener('change', calculateTotals);
    
    // Save / Print / Delete voucher
    el.btnSaveVoucher.addEventListener('click', saveVoucher);
    el.btnPrintVoucher.addEventListener('click', () => window.print());
    el.btnDeleteCurrent.addEventListener('click', deleteCurrentVoucher);
    
    // Filters & Search
    el.filterSearch.addEventListener('input', renderDashboard);
    el.filterType.addEventListener('change', renderDashboard);
    el.filterStatus.addEventListener('change', renderDashboard);
    el.filterDate.addEventListener('change', renderDashboard);
}

// Show toast notification
function showToast(message, isError = false) {
    el.toast.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-xmark text-danger' : 'fa-circle-check text-success'}"></i> ${message}`;
    el.toast.classList.add('show');
    setTimeout(() => el.toast.classList.remove('show'), 3000);
}

// Switch back to Dashboard view
function showDashboard() {
    el.formView.style.display = 'none';
    el.dashboardView.style.display = 'block';
    renderDashboard();
}

// Fetch Vouchers from Google Sheet
async function fetchVouchersFromCloud() {
    if (!googleScriptUrl) {
        renderDashboard();
        return;
    }
    
    try {
        if (el.syncStatusText) el.syncStatusText.textContent = "Syncing...";
        
        // Use POST with action 'get' to completely bypass CORS redirect checks in Google Sheets Web Apps
        const response = await fetch(googleScriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({ action: 'get' })
        });
        
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        if (Array.isArray(data)) {
            // Process the raw data from Google Sheets
            vouchers = data.map(row => {
                try {
                    // Load full detail payload if present
                    if (row['Full JSON Data']) {
                        return JSON.parse(row['Full JSON Data']);
                    }
                } catch(e) {}
                
                // Fallback: build voucher from spreadsheet columns
                return {
                    voucherNo: row['Voucher No'],
                    date: row['Date of Request'],
                    requestBy: row['Requestor'],
                    department: row['Department'],
                    voucherType: row['Expense Type'],
                    grandTotal: parseFloat(row['Grand Total']) || 0,
                    vatAmount: parseFloat(row['VAT Amount']) || 0,
                    supplier: row['Supplier Details'],
                    reason: row['Reason'],
                    status: row['Status'] || 'Pending',
                    items: [] // Empty fallback
                };
            });
            
            // Sync with local backup
            localStorage.setItem('ecoseal_vouchers', JSON.stringify(vouchers));
            if (el.syncStatusText) el.syncStatusText.textContent = "Cloud Synced";
        }
    } catch (error) {
        console.error('Error syncing with Google Sheets:', error);
        showToast('Google Sheet connection failed. Using local data.', true);
        if (el.syncStatusText) el.syncStatusText.textContent = "Offline/Local Mode";
    }
    
    renderDashboard();
}

// Test Connection
async function testGoogleSheetsConnection() {
    const url = el.settingsSheetUrl.value.trim();
    if (!url) {
        showToast('Please enter a valid URL', true);
        return;
    }
    
    // Safety check: ensure they copied the Web App URL and NOT the spreadsheet editor URL
    if (url.includes('docs.google.com/spreadsheets')) {
        showToast('Please copy the Web App URL (from Apps Script Deploy), NOT the Google Sheet URL!', true);
        alert('พบข้อมูลไม่ถูกต้อง: ลิงก์ที่คุณใส่คือลิงก์หน้าเว็บ Google Sheets โดยตรง \n\nกรุณาใช้ลิงก์ "Web App URL" ที่ได้จากการกด Deploy > New Deployment ในหน้า Apps Script (ลิงก์จะมีคำว่า /macros/s/.../exec)');
        return;
    }
    
    el.testConnSpinner.style.display = 'inline-block';
    el.btnTestConnection.disabled = true;
    
    try {
        // Use no-cors mode to bypass browser CORS pre-flight block on redirects during testing
        const response = await fetch(url, { mode: 'no-cors' });
        showToast('Google Sheet connected successfully!');
    } catch(error) {
        console.error(error);
        showToast('Connection failed. Make sure deployment is set to "Anyone".', true);
    } finally {
        el.testConnSpinner.style.display = 'none';
        el.btnTestConnection.disabled = false;
    }
}

// Auto Voucher Number Generator
function generateVoucherNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const prefix = `PC-${year}${month}${day}-`;
    
    // Count vouchers with same date prefix
    const count = vouchers.filter(v => v.voucherNo && v.voucherNo.startsWith(prefix)).length;
    const nextNumber = String(count + 1).padStart(3, '0');
    return prefix + nextNumber;
}

// Calculate Summary Statistics and Render Table
function renderDashboard() {
    const searchQuery = el.filterSearch.value.toLowerCase().trim();
    const typeFilter = el.filterType.value;
    const dateFilter = el.filterDate.value;
    
    let filtered = vouchers;
    
    // Apply filters
    if (searchQuery) {
        filtered = filtered.filter(v => 
            (v.voucherNo && v.voucherNo.toLowerCase().includes(searchQuery)) ||
            (v.requestBy && v.requestBy.toLowerCase().includes(searchQuery)) ||
            (v.department && v.department.toLowerCase().includes(searchQuery)) ||
            (v.reason && v.reason.toLowerCase().includes(searchQuery)) ||
            (v.items && v.items.some(item => item.description && item.description.toLowerCase().includes(searchQuery)))
        );
    }
    
    if (typeFilter !== 'All') {
        filtered = filtered.filter(v => v.voucherType === typeFilter);
    }
    
    if (dateFilter !== 'All') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        filtered = filtered.filter(v => {
            if (!v.date) return false;
            const vDate = new Date(v.date);
            vDate.setHours(0, 0, 0, 0);
            
            if (dateFilter === 'Today') {
                return vDate.getTime() === today.getTime();
            } else if (dateFilter === 'ThisWeek') {
                const diffTime = Math.abs(today - vDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= 7;
            } else if (dateFilter === 'ThisMonth') {
                return vDate.getMonth() === today.getMonth() && vDate.getFullYear() === today.getFullYear();
            }
            return true;
        });
    }
    
    // Sort by Date (newest first)
    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    
    // Render Stats
    let totalAmt = 0;
    vouchers.forEach(v => {
        totalAmt += parseFloat(v.grandTotal) || 0;
    });
    
    el.statTotalAmount.textContent = `฿${totalAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Set Total Requests count card
    const statTotalCountEl = document.getElementById('statTotalCount');
    if (statTotalCountEl) {
        statTotalCountEl.textContent = vouchers.length;
    }
    
    el.recordCount.textContent = `${filtered.length} records found`;
    
    // Render Table Rows
    el.recordsTableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        el.recordsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-5">
                    <i class="fa-solid fa-folder-open fa-2x mb-2"></i>
                    <p>No matching petty cash requests found.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(v => {
        const tr = document.createElement('tr');
        const formattedAmount = (parseFloat(v.grandTotal) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        tr.innerHTML = `
            <td class="font-bold">${v.voucherNo}</td>
            <td>${formatDisplayDate(v.date)}</td>
            <td>${v.requestBy || '-'}</td>
            <td>${v.department || '-'}</td>
            <td><span class="badge">${v.voucherType || 'Petty Cash'}</span></td>
            <td class="font-bold">฿${formattedAmount}</td>
            <td class="actions-cell">
                <button class="btn btn-xs btn-secondary-outline btn-view" data-id="${v.voucherNo}">
                    <i class="fa-solid fa-eye"></i> View/Print
                </button>
                <button class="btn btn-xs btn-secondary btn-edit" data-id="${v.voucherNo}">
                    <i class="fa-solid fa-pen-to-square"></i> Edit
                </button>
            </td>
        `;
        
        // View Button handler
        tr.querySelector('.btn-view').addEventListener('click', () => openVoucherForm(v.voucherNo, true));
        // Edit Button handler
        tr.querySelector('.btn-edit').addEventListener('click', () => openVoucherForm(v.voucherNo, false));
        
        el.recordsTableBody.appendChild(tr);
    });
}

// Open Voucher Form in Editor view
function openVoucherForm(voucherId = null, viewOnly = false) {
    currentVoucherId = voucherId;
    
    el.dashboardView.style.display = 'none';
    el.formView.style.display = 'block';
    
    // Toggle actions buttons
    el.btnDeleteCurrent.style.display = voucherId ? 'inline-flex' : 'none';
    
    if (voucherId) {
        // Edit Mode
        const voucher = vouchers.find(v => v.voucherNo === voucherId);
        if (voucher) {
            loadVoucherIntoForm(voucher);
        } else {
            showToast('Voucher not found!', true);
            showDashboard();
            return;
        }
    } else {
        // Create Mode
        clearVoucherForm();
        el.voucherNo.value = generateVoucherNumber();
        el.voucherDate.value = new Date().toISOString().split('T')[0];
        el.signRequestDate.value = new Date().toISOString().split('T')[0];
        
        // Render 10 blank rows for authentic PDF template
        renderVoucherRows([]);
    }
    
    // Toggle field lock if View-Only mode
    toggleFormLock(viewOnly);
}

// Lock/Unlock form inputs
function toggleFormLock(lock) {
    const inputs = el.formView.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        if (input.id === 'voucherNo') return; // Voucher number is always read-only
        input.disabled = lock;
    });
    
    // Hide print-specific delete/add buttons
    if (lock) {
        el.btnAddRow.style.display = 'none';
        el.btnSaveVoucher.style.display = 'none';
        el.btnDeleteCurrent.style.display = 'none';
        el.formView.querySelectorAll('.btn-remove-row').forEach(b => b.style.display = 'none');
    } else {
        el.btnAddRow.style.display = 'inline-flex';
        el.btnSaveVoucher.style.display = 'inline-flex';
        if (currentVoucherId) el.btnDeleteCurrent.style.display = 'inline-flex';
        el.formView.querySelectorAll('.btn-remove-row').forEach(b => b.style.display = 'inline-flex');
    }
}

// Clear all fields in the Form View
function clearVoucherForm() {
    // Reset all radio voucherTypes
    const radios = el.formView.querySelectorAll('input[name="voucherType"]');
    radios.forEach((r, i) => r.checked = i === 0);
    
    el.voucherRequestBy.value = '';
    el.voucherDepartment.value = '';
    el.voucherPayCheck.value = '';
    el.voucherDuePayment.value = '';
    el.voucherDateRequire.value = '';
    el.voucherRemark.value = '';
    el.voucherSupplier.value = '';
    el.voucherReason.value = '';
    el.vatToggle.checked = false;
    
    // Signatures
    el.signRequestBy.value = '';
    el.signRequestDate.value = '';
    el.signDepApprove.value = '';
    el.signDepApproveDate.value = '';
    el.signMd.value = '';
    el.signMdDate.value = '';
    el.signFinance.value = '';
    el.signFinanceDate.value = '';
    el.signReceivedBy.value = '';
    el.signReceivedDate.value = '';
    el.signPaidBy.value = '';
    el.signPaidDate.value = '';
    
    // Display Subtotals
    el.subTotalDisplay.value = '0.00';
    el.vatDisplay.value = '0.00';
    el.grandTotalDisplay.value = '0.00';
}

// Load voucher object into Form editor
function loadVoucherIntoForm(v) {
    clearVoucherForm();
    
    // Select correct radio button
    const radios = el.formView.querySelectorAll('input[name="voucherType"]');
    radios.forEach(radio => {
        if (radio.value === v.voucherType) radio.checked = true;
    });
    
    el.voucherNo.value = v.voucherNo || '';
    el.voucherDate.value = v.date || '';
    el.voucherRequestBy.value = v.requestBy || '';
    el.voucherDepartment.value = v.department || '';
    el.voucherPayCheck.value = v.payCheck || '';
    el.voucherDuePayment.value = v.duePayment || '';
    el.voucherDateRequire.value = v.dateRequire || '';
    el.voucherRemark.value = v.remark || '';
    el.voucherSupplier.value = v.supplier || '';
    el.voucherReason.value = v.reason || '';
    el.vatToggle.checked = !!v.vatEnabled;
    
    // Pre-fill Signatures
    el.signRequestBy.value = v.signRequestBy || v.requestBy || '';
    el.signRequestDate.value = v.signRequestDate || v.date || '';
    el.signDepApprove.value = v.signDepApprove || '';
    el.signDepApproveDate.value = v.signDepApproveDate || '';
    el.signMd.value = v.signMd || '';
    el.signMdDate.value = v.signMdDate || '';
    el.signFinance.value = v.signFinance || '';
    el.signFinanceDate.value = v.signFinanceDate || '';
    el.signReceivedBy.value = v.signReceivedBy || '';
    el.signReceivedDate.value = v.signReceivedDate || '';
    el.signPaidBy.value = v.signPaidBy || '';
    el.signPaidDate.value = v.signPaidDate || '';
    
    // Render item rows
    renderVoucherRows(v.items || []);
}

// Render dynamic rows in items table
function renderVoucherRows(items = []) {
    el.itemsTableBody.innerHTML = '';
    
    if (items.length === 0) {
        // Start with exactly 1 empty row for a new request
        addVoucherRow('', '', '');
    } else {
        // Render only the rows that have actual data
        items.forEach(item => {
            addVoucherRow(item.description, item.unit, item.price);
        });
    }
    
    calculateTotals();
}

// Add a single item row to the table
function addVoucherRow(desc = '', qty = '', price = '') {
    const tr = document.createElement('tr');
    const index = el.itemsTableBody.children.length + 1;
    
    tr.innerHTML = `
        <td class="text-center font-bold index-num">${index}</td>
        <td>
            <input type="text" class="print-input row-desc" value="${desc}" placeholder="Item description / รายการเบิกจ่าย">
        </td>
        <td>
            <input type="number" class="print-input text-right row-qty" value="${qty}" placeholder="0" min="0">
        </td>
        <td>
            <input type="number" class="print-input text-right row-price" value="${price}" placeholder="0.00" min="0" step="0.01">
        </td>
        <td>
            <input type="text" class="print-input text-right row-total font-bold" readonly value="0.00">
        </td>
        <td class="text-center hide-print">
            <button type="button" class="btn btn-xs btn-danger-outline btn-remove-row" style="padding: 0.1rem 0.3rem;"><i class="fa-solid fa-minus"></i></button>
        </td>
    `;
    
    // Remove Row handler
    tr.querySelector('.btn-remove-row').addEventListener('click', () => {
        tr.remove();
        reindexTableRows();
        calculateTotals();
    });
    
    // Calculation event listeners
    const qtyInput = tr.querySelector('.row-qty');
    const priceInput = tr.querySelector('.row-price');
    
    qtyInput.addEventListener('input', () => updateRowTotal(tr));
    priceInput.addEventListener('input', () => updateRowTotal(tr));
    
    el.itemsTableBody.appendChild(tr);
    updateRowTotal(tr);
}

// Recalculate numbering indices after deletion
function reindexTableRows() {
    const rows = el.itemsTableBody.querySelectorAll('tr');
    rows.forEach((row, i) => {
        row.querySelector('.index-num').textContent = i + 1;
    });
}

// Recalculate row total
function updateRowTotal(tr) {
    const qty = parseFloat(tr.querySelector('.row-qty').value) || 0;
    const price = parseFloat(tr.querySelector('.row-price').value) || 0;
    const total = qty * price;
    
    tr.querySelector('.row-total').value = total > 0 ? total.toFixed(2) : '';
    calculateTotals();
}

// Calculate Grand Totals (Subtotal, VAT 7%, Grand Total)
function calculateTotals() {
    const rows = el.itemsTableBody.querySelectorAll('tr');
    let subtotal = 0;
    
    rows.forEach(tr => {
        const qty = parseFloat(tr.querySelector('.row-qty').value) || 0;
        const price = parseFloat(tr.querySelector('.row-price').value) || 0;
        subtotal += qty * price;
    });
    
    const vatEnabled = el.vatToggle.checked;
    const vatAmount = vatEnabled ? subtotal * 0.07 : 0;
    const grandTotal = subtotal + vatAmount;
    
    el.subTotalDisplay.value = subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    el.vatDisplay.value = vatAmount > 0 ? vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    el.grandTotalDisplay.value = grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Get form data and return as structured object
function getFormVoucherData() {
    // Determine Expense Type
    let voucherType = 'Petty Cash';
    const checkedRadio = el.formView.querySelector('input[name="voucherType"]:checked');
    if (checkedRadio) voucherType = checkedRadio.value;
    
    // Collect non-empty rows
    const items = [];
    const rows = el.itemsTableBody.querySelectorAll('tr');
    rows.forEach(tr => {
        const description = tr.querySelector('.row-desc').value.trim();
        const unit = tr.querySelector('.row-qty').value;
        const price = tr.querySelector('.row-price').value;
        
        // Only save rows with actual content
        if (description || unit || price) {
            items.push({
                description,
                unit: parseInt(unit) || 0,
                price: parseFloat(price) || 0
            });
        }
    });
    
    const subtotal = items.reduce((sum, item) => sum + (item.unit * item.price), 0);
    const vatEnabled = el.vatToggle.checked;
    const vatAmount = vatEnabled ? subtotal * 0.07 : 0;
    const grandTotal = subtotal + vatAmount;
    
    return {
        voucherNo: el.voucherNo.value.trim(),
        date: el.voucherDate.value,
        requestBy: el.voucherRequestBy.value.trim(),
        department: el.voucherDepartment.value.trim(),
        voucherType,
        payCheck: el.voucherPayCheck.value.trim(),
        duePayment: el.voucherDuePayment.value,
        dateRequire: el.voucherDateRequire.value,
        remark: el.voucherRemark.value.trim(),
        supplier: el.voucherSupplier.value.trim(),
        reason: el.voucherReason.value.trim(),
        vatEnabled,
        vatAmount,
        grandTotal,
        status: 'Request',
        
        // Signatures names
        signRequestBy: el.signRequestBy.value.trim(),
        signRequestDate: el.signRequestDate.value,
        signDepApprove: el.signDepApprove.value.trim(),
        signDepApproveDate: el.signDepApproveDate.value,
        signMd: el.signMd.value.trim(),
        signMdDate: el.signMdDate.value,
        signFinance: el.signFinance.value.trim(),
        signFinanceDate: el.signFinanceDate.value,
        signReceivedBy: el.signReceivedBy.value.trim(),
        signReceivedDate: el.signReceivedDate.value,
        signPaidBy: el.signPaidBy.value.trim(),
        signPaidDate: el.signPaidDate.value,
        
        // List items
        items
    };
}

// Save Voucher (Local and Cloud Sync)
async function saveVoucher() {
    const payload = getFormVoucherData();
    
    // Validation
    if (!payload.requestBy) {
        showToast('Please enter Requestor Name / กรุณาใส่ชื่อผู้ขอเบิก', true);
        el.voucherRequestBy.focus();
        return;
    }
    if (!payload.department) {
        showToast('Please enter Department / กรุณาใส่แผนก', true);
        el.voucherDepartment.focus();
        return;
    }
    if (payload.items.length === 0) {
        showToast('Please add at least one item description / กรุณากรอกรายการเบิกจ่ายอย่างน้อย 1 รายการ', true);
        return;
    }
    
    // Save to local state memory
    const existingIndex = vouchers.findIndex(v => v.voucherNo === payload.voucherNo);
    if (existingIndex >= 0) {
        vouchers[existingIndex] = payload;
    } else {
        vouchers.push(payload);
    }
    
    // Backup to local storage
    localStorage.setItem('ecoseal_vouchers', JSON.stringify(vouchers));
    showToast('Saved locally!');
    
    // Save to Google Sheet Cloud if URL is present
    if (googleScriptUrl) {
        el.btnSaveVoucher.disabled = true;
        el.btnSaveVoucher.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing...';
        
        try {
            const response = await fetch(googleScriptUrl, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify({ action: 'save', data: payload }) // Send unified POST save action
            });
            
            const resData = await response.json();
            if (resData.success) {
                showToast('Synchronized with Google Sheet Cloud!');
                fetchVouchersFromCloud(); // Refresh history
            } else {
                throw new Error(resData.error || 'Server error');
            }
        } catch (error) {
            console.error('Error syncing voucher with Google Sheet:', error);
            showToast('Google Sheet Sync failed. Saved locally.', true);
        } finally {
            el.btnSaveVoucher.disabled = false;
            el.btnSaveVoucher.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Request';
        }
    }
    
    showDashboard();
}

// Delete Voucher
async function deleteCurrentVoucher() {
    if (!currentVoucherId) return;
    
    if (!confirm(`Are you sure you want to delete Voucher ${currentVoucherId}?`)) {
        return;
    }
    
    // Update local state
    vouchers = vouchers.filter(v => v.voucherNo !== currentVoucherId);
    localStorage.setItem('ecoseal_vouchers', JSON.stringify(vouchers));
    showToast('Voucher deleted from local storage.');
    
    // Apps script endpoint delete is not fully supported in standard appends, 
    // but we can update its status to "Deleted" or let them clear it in Google Sheets manually.
    // For completeness, if we send a POST with status: 'Deleted', our Apps Script will naturally update the row!
    // Send unified POST delete action to remove or mark row in Google Sheets
    if (googleScriptUrl) {
        try {
            await fetch(googleScriptUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'delete', voucherNo: currentVoucherId })
            });
            
            fetchVouchersFromCloud(); // Refresh
        } catch (e) {
            console.error('Failed to sync deletion to Google Sheets:', e);
        }
    }
    
    showDashboard();
}

// Helper: Format Date for UI Table
function formatDisplayDate(dateString) {
    if (!dateString) return '-';
    try {
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    } catch(e) {
        return dateString;
    }
}

// Automatically clear placeholder text for empty dates when printing
function syncEmptyDateClasses() {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) {
            input.classList.add('date-empty');
            input.setAttribute('value', '');
        } else {
            input.classList.remove('date-empty');
            input.setAttribute('value', input.value);
        }
    });
}

// Hook into the browser print cycles to ensure dates are synced
window.addEventListener('beforeprint', syncEmptyDateClasses);
// Also listen to inputs dynamically on change
document.addEventListener('input', (e) => {
    if (e.target && e.target.type === 'date') {
        if (!e.target.value) {
            e.target.classList.add('date-empty');
        } else {
            e.target.classList.remove('date-empty');
        }
    }
});
