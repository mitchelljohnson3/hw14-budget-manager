let transactions = [];
let myChart;
// indicator to tell our app if the connection is detected or not
let offline = false;

// indexeddb setup/
let request = window.indexedDB.open("OfflineTransactionsDatabase", 1), db, tx, store, index;
request.onupgradeneeded = function(e) {
  let db = request.result,
      store = db.createObjectStore("transactionStore", {keyPath: "name"}),
      index = store.createIndex("name", "name", {unique: false});
}
request.onerror = function(e) {
  console.log("There was an error: " + e.target.errorCode);
};
request.onsuccess = function(e) {
  db = request.result;
  tx = db.transaction("transactionStore", "readwrite");
  store = tx.objectStore("transactionStore");
  index = store.index("name");
  console.log(`successfully created database: ${db.name}`);

  db.onerror = function(e) {
    console.log("ERROR", + e.target.errorCode);
  }
}


fetch("/api/transaction")
  .then(response => {
    return response.json();
  })
  .then(data => {
    // save db data on global variable
    transactions = data;

    populateTotal();
    populateTable();
    populateChart();
  });

function populateTotal() {
  // reduce transaction amounts to a single total value
  let total = transactions.reduce((total, t) => {
    return total + parseInt(t.value);
  }, 0);

  let totalEl = document.querySelector("#total");
  totalEl.textContent = total;
}

function populateTable() {
  let tbody = document.querySelector("#tbody");
  tbody.innerHTML = "";

  transactions.forEach(transaction => {
    // create and populate a table row
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${transaction.name}</td>
      <td>${transaction.value}</td>
    `;

    tbody.appendChild(tr);
  });
}

function populateChart() {
  // copy array and reverse it
  let reversed = transactions.slice().reverse();
  let sum = 0;

  // create date labels for chart
  let labels = reversed.map(t => {
    let date = new Date(t.date);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  });

  // create incremental values for chart
  let data = reversed.map(t => {
    sum += parseInt(t.value);
    return sum;
  });

  // remove old chart if it exists
  if (myChart) {
    myChart.destroy();
  }

  let ctx = document.getElementById("myChart").getContext("2d");

  myChart = new Chart(ctx, {
    type: 'line',
      data: {
        labels,
        datasets: [{
            label: "Total Over Time",
            fill: true,
            backgroundColor: "#6666ff",
            data
        }]
    }
  });
}

function sendTransaction(isAdding) {
  let nameEl = document.querySelector("#t-name");
  let amountEl = document.querySelector("#t-amount");
  let errorEl = document.querySelector(".form .error");

  // validate form
  if (nameEl.value === "" || amountEl.value === "") {
    errorEl.textContent = "Missing Information";
    return;
  }
  else {
    errorEl.textContent = "";
  }

  // create record
  let transaction = {
    name: nameEl.value,
    value: amountEl.value,
    date: new Date().toISOString()
  };

  // if subtracting funds, convert amount to negative number
  if (!isAdding) {
    transaction.value *= -1;
  }

  // add to beginning of current array of data
  transactions.unshift(transaction);

  // re-run logic to populate ui with new record
  populateChart();
  populateTable();
  populateTotal();
  
  // also send to server
  fetch("/api/transaction", {
    method: "POST",
    body: JSON.stringify(transaction),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  })
  .then(response => {  
    if(offline) {
      bulkUpload();
      offline = false;
    }  
    return response.json();
  })
  .then(data => {
    if (data.errors) {
      errorEl.textContent = "Missing Information";
    }
    else {
      // clear form
      nameEl.value = "";
      amountEl.value = "";
    }
  })
  .catch(err => {
    // fetch failed, so save in indexed db
    saveRecord(transaction);

    // clear form
    nameEl.value = "";
    amountEl.value = "";
  });
}

document.querySelector("#add-btn").onclick = function() {
  sendTransaction(true);
};

document.querySelector("#sub-btn").onclick = function() {
  sendTransaction(false);
};

// this saves a record in indexeddb when there is no connection detected
function saveRecord(transaction) {
  tx = db.transaction("transactionStore", "readwrite");
  store = tx.objectStore("transactionStore");

  console.log("storing record");
  store.put(transaction);
  offline = true;
}
// this uploads all of the stored data in indexeddb when the conntection has been resetablished
function bulkUpload() {
  tx = db.transaction("transactionStore", "readwrite");
  store = tx.objectStore("transactionStore");

  console.log("bulk uploading");
  store.getAll().onsuccess = function(e) {
    fetch("/api/transaction/bulk", {
      method: "POST",
      body: JSON.stringify(e.target.result),
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json"
      }
    });
  }
}