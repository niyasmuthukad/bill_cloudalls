// ---- CONFIGURATION ----
// 1. PASTE YOUR WEB APP URL FROM PHASE 4
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRvc4QpF3KRKV9DqE7Z3rAk9AKP--5ykSeXSXO41i0N25LM5zjCenRWwKZn9DxmOdY/exec";
// -----------------------

// Global variables for auth
let loggedInUser = null;
let loggedInPassword = null; // Storing password is not secure, but required by this plan

let productList = [];

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginButton = document.getElementById('login-button');
const loginUsernameEl = document.getElementById('login-username');
const loginPasswordEl = document.getElementById('login-password');
const loginErrorEl = document.getElementById('login-error');

const loadingSpinner = document.getElementById('loading-spinner');
const userEmailEl = document.getElementById('user-email'); // Will show username
const logoutButton = document.getElementById('logout-button');
const invoiceIdEl = document.getElementById('invoice-id');
const invoiceDateEl = document.getElementById('invoice-date');
const clientNameEl = document.getElementById('client-name');
const itemsTableBody = document.querySelector('#line-items-table tbody');
const addItemButton = document.getElementById('add-item-button');
const totalEl = document.getElementById('total');
const advanceEl = document.getElementById('advance');
const subtotalEl = document.getElementById('subtotal');
const saveBillButton = document.getElementById('save-bill-button');
const addNewProductButton = document.getElementById('add-new-product-button');
const newProductModal = document.getElementById('new-product-modal');
const closeModalButton = document.getElementById('close-modal-button');
const saveNewProductButton = document.getElementById('save-new-product-button');


// --- INITIALIZATION ---

// Add event listeners
document.addEventListener('DOMContentLoaded', () => {
    loginButton.addEventListener('click', handleLogin);
    logoutButton.addEventListener('click', handleSignOut);
    addItemButton.addEventListener('click', addLineItem);
    itemsTableBody.addEventListener('change', handleItemChange);
    itemsTableBody.addEventListener('click', handleItemRemove);
    advanceEl.addEventListener('input', calculateTotals);
    saveBillButton.addEventListener('click', saveBill);
    addNewProductButton.addEventListener('click', () => newProductModal.style.display = 'block');
    closeModalButton.addEventListener('click', () => newProductModal.style.display = 'none');
    saveNewProductButton.addEventListener('click', saveNewProduct);
    
    setTodaysDate();
});

// --- AUTHENTICATION ---

async function handleLogin() {
    const username = loginUsernameEl.value;
    const password = loginPasswordEl.value;

    if (!username || !password) {
        showLoginError("Please enter username and password");
        return;
    }
    
    showSpinner(true);
    
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'manualLogin',
                username: username,
                password: password
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await res.json();
        showSpinner(false);

        if (data.status === 'success') {
            // LOGIN SUCCESSFUL
            loggedInUser = data.user;
            loggedInPassword = password; // Store password for future requests
            
            userEmailEl.textContent = loggedInUser;
            loginScreen.style.display = 'none';
            appScreen.style.display = 'block';
            showLoginError("", false); // Hide error
            
            getInitialAppData(); // Load data
            
        } else {
            // LOGIN FAILED
            showLoginError(data.message);
        }
        
    } catch (error) {
        showSpinner(false);
        showLoginError("An error occurred. Check connection.");
    }
}

function showLoginError(message, show = true) {
    loginErrorEl.textContent = message;
    loginErrorEl.style.display = show ? 'block' : 'none';
}

function handleSignOut() {
    loggedInUser = null;
    loggedInPassword = null;
    appScreen.style.display = 'none';
    loginScreen.style.display = 'block';
    loginPasswordEl.value = ""; // Clear password field
}

// --- DATA FETCHING (from Google Apps Script) ---

// Helper function for all server calls
async function callGoogleScript(action, payload = {}) {
    // Check if logged in
    if (!loggedInUser || !loggedInPassword) {
        alert("You are not logged in.");
        handleSignOut();
        return;
    }
    
    showSpinner(true);
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                username: loggedInUser,
                password: loggedInPassword, // Send auth on every request
                action: action,
                ...payload
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        
        showSpinner(false);
        return data;
        
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred: ' + error.message);
        showSpinner(false);
        if (error.message.includes("User not authorized")) {
            handleSignOut(); // Log out unauthorized user
        }
    }
}

// Gets products and a new invoice number on page load
async function getInitialAppData() {
    const data = await callGoogleScript('getAppData');
    if (data) {
        productList = data.products;
        invoiceIdEl.value = data.invoiceNumber;
        
        // Create the datalist for product autocomplete
        createProductDatalist();
        
        // Add one blank item row to start
        addLineItem();
    }
}

// Creates the <datalist> element for product autocomplete
function createProductDatalist() {
    let datalist = document.getElementById('product-list');
    if (datalist) datalist.remove(); // Remove old one
    
    datalist = document.createElement('datalist');
    datalist.id = 'product-list';
    productList.forEach(product => {
        const option = document.createElement('option');
        option.value = product.description;
        option.dataset.price = product.unitPrice;
        datalist.appendChild(option);
    });
    document.body.appendChild(datalist);
}

// --- BILLING FORM LOGIC ---

function setTodaysDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    invoiceDateEl.value = `${day}-${month}-${year}`;
}

function addLineItem() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" class="item-desc" list="product-list"></td>
        <td><input type="number" class="item-qty" value="1"></td>
        <td><input type="number" class="item-price"></td>
        <td><input type="text" class="item-total" readonly></td>
        <td><button class="remove-item-button">X</button></td>
    `;
    itemsTableBody.appendChild(row);
}

function handleItemChange(e) {
    const target = e.target;
    const row = target.closest('tr');
    if (!row) return;

    const descInput = row.querySelector('.item-desc');
    const priceInput = row.querySelector('.item-price');
    
    if (target.classList.contains('item-desc')) {
        const selectedProduct = productList.find(p => p.description === descInput.value);
        if (selectedProduct) {
            priceInput.value = selectedProduct.unitPrice;
        }
    }
    calculateRowTotal(row);
    calculateTotals();
}

function handleItemRemove(e) {
    if (e.target.classList.contains('remove-item-button')) {
        const row = e.target.closest('tr');
        if (itemsTableBody.rows.length > 1) {
            row.remove();
            calculateTotals();
        }
    }
}

function calculateRowTotal(row) {
    const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const total = (qty * price).toFixed(2);
    row.querySelector('.item-total').value = total;
}

function calculateTotals() {
    let currentTotal = 0;
    document.querySelectorAll('#line-items-table tbody tr').forEach(row => {
        calculateRowTotal(row);
        currentTotal += parseFloat(row.querySelector('.item-total').value) || 0;
    });

    const advance = parseFloat(advanceEl.value) || 0;
    const subtotal = currentTotal - advance;

    totalEl.value = currentTotal.toFixed(2);
    subtotalEl.value = subtotal.toFixed(2);
}

// --- SAVING DATA ---

async function saveNewProduct() {
    const description = document.getElementById('new-product-desc').value;
    const unitPrice = parseFloat(document.getElementById('new-product-price').value);

    if (!description || !unitPrice) {
        alert("Please enter both description and price.");
        return;
    }

    const data = await callGoogleScript('addNewProduct', { 
        product: { description, unitPrice } 
    });

    if (data && data.status === 'success') {
        productList.push(data.newProduct);
        createProductDatalist();
        document.getElementById('new-product-desc').value = '';
        document.getElementById('new-product-price').value = '';
        newProductModal.style.display = 'none';
        alert("New product added!");
    }
}

async function saveBill() {
    const bill = {
        invoiceId: invoiceIdEl.value,
        date: invoiceDateEl.value,
        clientName: clientNameEl.value,
        total: totalEl.value,
        advance: advanceEl.value,
        subtotal: subtotalEl.value,
        items: []
    };

    if (!bill.clientName) {
        alert("Please enter a client name.");
        return;
    }

    let itemsValid = true;
    document.querySelectorAll('#line-items-table tbody tr').forEach(row => {
        const description = row.querySelector('.item-desc').value;
        const quantity = row.querySelector('.item-qty').value;
        const unitPrice = row.querySelector('.item-price').value;
        
        if (description && quantity > 0 && unitPrice > 0) {
            bill.items.push({ description, quantity, unitPrice });
        } else if (description || quantity > 1 || unitPrice > 0) {
            itemsValid = false;
        }
    });

    if (!itemsValid || bill.items.length === 0) {
        alert("Please make sure all item rows are filled correctly.");
        return;
    }

    const data = await callGoogleScript('saveBill', { bill });

    if (data && data.status === 'success') {
        alert("Bill saved successfully!");
        resetForm();
        const newData = await callGoogleScript('getNewInvoiceNumber');
        if (newData) {
            invoiceIdEl.value = newData.invoiceId;
        }
    }
}

function resetForm() {
    clientNameEl.value = '';
    advanceEl.value = '0';
    itemsTableBody.innerHTML = '';
    setTodaysDate();
    addLineItem();
    calculateTotals();
}

function showSpinner(show) {
    loadingSpinner.style.display = show ? 'block' : 'none';
}