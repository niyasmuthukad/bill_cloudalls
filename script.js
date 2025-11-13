// ---- CONFIGURATION. ----
// 1. PASTE YOUR CLIENT ID FROM PHASE 2
const GOOGLE_CLIENT_ID = "http://430347559692-d3ke13qu1p6edd65hdreiubuia0q8jgk.apps.googleusercontent.com"; 

// 2. PASTE YOUR WEB APP URL FROM PHASE 4
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwmzrrKfWGqIsC-Fv6Tb3uwCS5SGiaKAHC7EleIYLa4BDlL-2zOLBFxX94RiuzIGPU/exec
";
// -----------------------

// Global variables
let googleIdToken = null;
let productList = [];

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loadingSpinner = document.getElementById('loading-spinner');
const userEmailEl = document.getElementById('user-email');
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

// Set Google Client ID in the HTML
document.getElementById('g_id_onload').dataset.clientId = GOOGLE_CLIENT_ID;

// Add event listeners
document.addEventListener('DOMContentLoaded', () => {
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

// This function is called by the Google Sign-In button
function handleCredentialResponse(response) {
    googleIdToken = response.credential;
    const user = parseJwt(googleIdToken);
    
    userEmailEl.textContent = user.email;
    loginScreen.style.display = 'none';
    appScreen.style.display = 'block';
    
    // Once logged in, get the app data (products and new invoice ID)
    getInitialAppData();
}

function handleSignOut() {
    googleIdToken = null;
    appScreen.style.display = 'none';
    loginScreen.style.display = 'block';
    // TODO: Add Google sign-out logic if needed
}

// Decodes the JWT token to get user info (like email)
function parseJwt (token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// --- DATA FETCHING (from Google Apps Script) ---

// Helper function for all server calls
async function callGoogleScript(action, payload = {}) {
    showSpinner(true);
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                idToken: googleIdToken,
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
    if (datalist) {
        datalist.remove(); // Remove old one if it exists
    }
    
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
    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');
    
    // If the description changed, try to autocomplete the price
    if (target.classList.contains('item-desc')) {
        const selectedProduct = productList.find(p => p.description === descInput.value);
        if (selectedProduct) {
            priceInput.value = selectedProduct.unitPrice;
        }
    }

    // Recalculate this row and all totals
    calculateRowTotal(row);
    calculateTotals();
}

function handleItemRemove(e) {
    if (e.target.classList.contains('remove-item-button')) {
        const row = e.target.closest('tr');
        if (itemsTableBody.rows.length > 1) { // Don't remove the last row
            row.remove();
            calculateTotals(); // Recalculate after removing
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
        calculateRowTotal(row); // Ensure row total is up to date
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
        // Add new product to our local list and update datalist
        productList.push(data.newProduct);
        createProductDatalist(); // Re-create the datalist
        
        // Clear inputs and close modal
        document.getElementById('new-product-desc').value = '';
        document.getElementById('new-product-price').value = '';
        newProductModal.style.display = 'none';
        
        alert("New product added!");
    }
}

async function saveBill() {
    // 1. Collect all bill data
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

    // Collect line items
    let itemsValid = true;
    document.querySelectorAll('#line-items-table tbody tr').forEach(row => {
        const description = row.querySelector('.item-desc').value;
        const quantity = row.querySelector('.item-qty').value;
        const unitPrice = row.querySelector('.item-price').value;
        
        if (description && quantity > 0 && unitPrice > 0) {
            bill.items.push({ description, quantity, unitPrice });
        } else if (description || quantity > 1 || unitPrice > 0) {
            // Row is partially filled
            itemsValid = false;
        }
    });

    if (!itemsValid || bill.items.length === 0) {
        alert("Please make sure all item rows are filled correctly.");
        return;
    }

    // 2. Send to Google Apps Script
    const data = await callGoogleScript('saveBill', { bill });

    if (data && data.status === 'success') {
        alert("Bill saved successfully!");
        // 3. Reset the form for a new bill
        resetForm();
        // 4. Get the next invoice number
        const newData = await callGoogleScript('getNewInvoiceNumber');
        if (newData) {
            invoiceIdEl.value = newData.invoiceId;
        }
    }
}

function resetForm() {
    clientNameEl.value = '';
    advanceEl.value = '0';
    itemsTableBody.innerHTML = ''; // Clear all rows
    setTodaysDate();
    addLineItem(); // Add one new blank row
    calculateTotals();
}

function showSpinner(show) {
    loadingSpinner.style.display = show ? 'block' : 'none';
}
