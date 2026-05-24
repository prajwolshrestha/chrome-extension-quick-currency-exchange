// Fallback currency lists
const ALL_CURRENCIES = [
  {
    "code": "NPR",
    "name": "Nepalese Rupee",
    "symbol": "₨",
    "flag": "🇳🇵"
  },
  {
    "code": "USD",
    "name": "United States Dollar",
    "symbol": "$",
    "flag": "🇺🇸"
  },
  {
    "code": "EUR",
    "name": "Euro",
    "symbol": "€",
    "flag": "🇪🇺"
  },
  {
    "code": "GBP",
    "name": "British Pound",
    "symbol": "£",
    "flag": "🇬🇧"
  },
  {
    "code": "AUD",
    "name": "Australian Dollar",
    "symbol": "A$",
    "flag": "🇦🇺"
  },
  {
    "code": "CAD",
    "name": "Canadian Dollar",
    "symbol": "C$",
    "flag": "🇨🇦"
  }
];
const DEFAULT_SELECTED = ["NPR","USD","EUR","GBP","AUD","CAD"];
const DEFAULT_BASE = "USD";

let cache = {
  rates: {},
  timestamp: 0,
  base: ""
};

// Elements
const amountInput = document.getElementById("convert-amount");
const fromSelect = document.getElementById("convert-from-select");
const quickResultsDiv = document.getElementById("quick-results");
const resultsContainer = null;
const updateTimeElement = null;
const currentBaseCodeSpan = null;
const refreshBtn = document.getElementById("refresh-btn");

// Initialize Setup 
document.addEventListener("DOMContentLoaded", () => {
  loadConfigAndData();

  refreshBtn.addEventListener("click", () => {
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = "0.4";
    refreshBtn.style.transform = "rotate(360deg)";
    refreshBtn.style.transition = "transform 1s ease";
    fetchExchangeRates(fromSelect.value, true).then(() => {
      refreshBtn.disabled = false;
      refreshBtn.style.opacity = "1";
      refreshBtn.style.transform = "rotate(0deg)";
      setTimeout(() => {
        refreshBtn.style.transition = "";
      }, 1000);
    });
  });

  amountInput.addEventListener("input", performConversion);
  amountInput.addEventListener("focus", () => {
    amountInput.select();
  });
  fromSelect.addEventListener("change", () => {
    updateBaseCodeDisplay();
    // Re-fetch rates of the newly selected base currency
    fetchExchangeRates(fromSelect.value).then(() => {
      performConversion();
    });
  });
});

function updateBaseCodeDisplay() {
  if (currentBaseCodeSpan) {
    currentBaseCodeSpan.textContent = fromSelect.value;
  }
}

function loadConfigAndData() {
  // Read from sync storage
  chrome.storage.sync.get({
    selectedCurrencies: DEFAULT_SELECTED,
    baseCurrency: DEFAULT_BASE
  }, (items) => {
    const selected = items.selectedCurrencies;
    const base = items.baseCurrency;

    // Build the From Selector dropdown
    fromSelect.innerHTML = "";
    ALL_CURRENCIES.forEach(curr => {
      if (selected.includes(curr.code)) {
        const option = document.createElement("option");
        option.value = curr.code;
        option.textContent = curr.flag + " " + curr.code;
        if (curr.code === base) {
          option.selected = true;
        }
        fromSelect.appendChild(option);
      }
    });

    if (fromSelect.innerHTML === "") {
      // Emergency fallback in case selection is empty
      const option = document.createElement("option");
      option.value = "USD";
      option.textContent = "🇺🇸 USD";
      option.selected = true;
      fromSelect.appendChild(option);
    }

    updateBaseCodeDisplay();
    
    // Fetch rates using the configured base currency
    fetchExchangeRates(fromSelect.value).then(() => {
      performConversion();
    });
  });
}

// Fetch exchange rates from custom endpoint
async function fetchExchangeRates(baseCode, forceRefresh = false) {
  const cacheKey = "rates_cache_" + baseCode;
  
  // Try retrieving cached rates first if not force refresh
  if (!forceRefresh) {
    const result = await getStorageData([cacheKey]);
    if (result && result[cacheKey]) {
      const cachedData = result[cacheKey];
      // Check if cash is not older than 1 hour (3600000 ms)
      if (Date.now() - cachedData.timestamp < 3600000) {
        cache = cachedData;
        renderRatesList();
        updateTimestamp(cachedData.timestamp);
        return;
      }
    }
  }

  if (updateTimeElement) updateTimeElement.textContent = "Fetching rates...";
  
  try {
    const URL = "https://open.er-api.com/v6/latest/" + baseCode;
    const response = await fetch(URL);
    if (!response.ok) throw new Error("HTTP error " + response.status);
    
    const data = await response.json();
    if (data && data.rates) {
      cache = {
        rates: data.rates,
        timestamp: Date.now(),
        base: baseCode
      };
      
      // Save cache to storage
      const storageObj = {};
      storageObj[cacheKey] = cache;
      await setStorageData(storageObj);
      
      renderRatesList();
      updateTimestamp(cache.timestamp);
    }
  } catch (error) {
    console.error("Failed fetching rates:", error);
    if (updateTimeElement) updateTimeElement.textContent = "Using offline data";
    
    // Build simulated rates in case offline
    const fallbackRates = {};
    const mockMultipliers = { USD: 1.0, EUR: 0.92, GBP: 0.79, JPY: 156.4, CAD: 1.36, AUD: 1.50, INR: 83.3, CHF: 0.91 };
    
    const baseMult = mockMultipliers[baseCode] || 1.0;
    ALL_CURRENCIES.forEach(c => {
      const targetMult = mockMultipliers[c.code] || 1.0;
      fallbackRates[c.code] = targetMult / baseMult;
    });

    cache = {
      rates: fallbackRates,
      timestamp: Date.now(),
      base: baseCode
    };
    renderRatesList();
    if (updateTimeElement) updateTimeElement.textContent = "Offline simulation";
  }
}

// Storage helpers promisified
function getStorageData(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

function setStorageData(obj) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(obj, resolve);
  });
}

function updateTimestamp(timestamp) {
  if (updateTimeElement) {
    const date = new Date(timestamp);
    updateTimeElement.textContent = "Updated: " + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
}

function renderRatesList() {
  if (!resultsContainer) return;
  resultsContainer.innerHTML = "";
  
  // Read current active selection
  chrome.storage.sync.get({
    selectedCurrencies: DEFAULT_SELECTED
  }, (items) => {
    const activeSelected = items.selectedCurrencies;
    const activeBase = fromSelect.value;
    
    ALL_CURRENCIES.forEach(curr => {
      // Exclude base currency from rate list
      if (activeSelected.includes(curr.code) && curr.code !== activeBase) {
        const rate = cache.rates[curr.code] || 1.0;
        
        const row = document.createElement("div");
        row.className = "currency-row";
        
        row.innerHTML = `
          <div class="curr-flag-code">
            <span class="row-flag">${curr.flag}</span>
            <div>
              <span class="row-code">${curr.code}</span>
              <div class="row-name">${curr.name}</div>
            </div>
          </div>
          <div class="curr-rate-info">
            <span class="row-rate-val">${rate.toFixed(4)}</span>
          </div>
        `;
        resultsContainer.appendChild(row);
      }
    });

    if (resultsContainer.innerHTML === "") {
      resultsContainer.innerHTML = "<div style='text-align:center;color:var(--text-secondary);padding:24px;font-size:0.8rem;'>Go to Settings to select other display currencies!</div>";
    }
  });
}

function performConversion() {
  const amount = parseFloat(amountInput.value) || 0;
  quickResultsDiv.innerHTML = "";
  
  chrome.storage.sync.get({
    selectedCurrencies: DEFAULT_SELECTED
  }, (items) => {
    const activeSelected = items.selectedCurrencies;
    const activeBase = fromSelect.value;
    
    let resultCount = 0;
    
    ALL_CURRENCIES.forEach(curr => {
      if (activeSelected.includes(curr.code) && curr.code !== activeBase) {
        const rate = cache.rates[curr.code] || 0;
        const converted = amount * rate;
        
        const resultRow = document.createElement("div");
        resultRow.className = "res-row";
        resultRow.innerHTML = `
          <div class="res-label">
            <span>${curr.flag}</span>
            <span>${curr.code}</span>
          </div>
          <div class="res-value">${curr.symbol} ${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        `;
        quickResultsDiv.appendChild(resultRow);
        resultCount++;
      }
    });

    if (resultCount === 0) {
      quickResultsDiv.innerHTML = "<div style='text-align:center;color:var(--text-secondary);font-size:0.8rem;'>No active conversion targets.</div>";
    }
  });
}
