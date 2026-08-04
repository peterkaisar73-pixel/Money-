let transactions = [];


// زر إضافة العملية
function addTransaction() {

    const type = document.getElementById("type").value;
    const amount = Number(document.getElementById("amount").value);
    const date = document.getElementById("date").value;
    const description = document.getElementById("description").value;


    // التأكد من إدخال البيانات
    if (amount <= 0 || date === "" || description === "") {

        alert("من فضلك أدخل كل البيانات");

        return;
    }


    // إنشاء العملية
    const transaction = {

        type: type,
        amount: amount,
        date: date,
        description: description

    };


    // إضافة العملية للقائمة
    transactions.push(transaction);


    // تحديث الجدول
    displayTransactions();


    // تحديث الملخص
    updateSummary();


    // تفريغ الخانات
    document.getElementById("amount").value = "";
    document.getElementById("description").value = "";

}



// عرض العمليات في الجدول
function displayTransactions() {

    const tableBody = document.querySelector("tbody");

    tableBody.innerHTML = "";


    transactions.forEach(function(transaction) {

        const row = document.createElement("tr");


        let typeName = "";


        if (transaction.type === "income") {

            typeName = "دخل";

        } else if (transaction.type === "expense") {

            typeName = "مصروف";

        } else if (transaction.type === "saving") {

            typeName = "ادخار";

        } else if (transaction.type === "investment") {

            typeName = "استثمار";

        } else if (transaction.type === "debt") {

            typeName = "سداد دين";

        }


        row.innerHTML = `

            <td>${transaction.date}</td>

            <td>${typeName}</td>

            <td>${transaction.description}</td>

            <td>${transaction.amount.toLocaleString()} جنيه</td>

        `;


        tableBody.appendChild(row);

    });

}



// حساب الملخص
function updateSummary() {

    let income = 0;
    let expenses = 0;
    let savings = 0;
    let investments = 0;
    let debts = 0;


    transactions.forEach(function(transaction) {

        if (transaction.type === "income") {

            income += transaction.amount;

        }

        else if (transaction.type === "expense") {

            expenses += transaction.amount;

        }

        else if (transaction.type === "saving") {

            savings += transaction.amount;

        }

        else if (transaction.type === "investment") {

            investments += transaction.amount;

        }

        else if (transaction.type === "debt") {

            debts += transaction.amount;

        }

    });


    const remaining =
        income -
        expenses -
        savings -
        investments -
        debts;


    const cards = document.querySelectorAll(".amount");


    cards[0].textContent =
        income.toLocaleString() + " جنيه";


    cards[1].textContent =
        expenses.toLocaleString() + " جنيه";


    cards[2].textContent =
        savings.toLocaleString() + " جنيه";


    cards[3].textContent =
        investments.toLocaleString() + " جنيه";


    cards[4].textContent =
        debts.toLocaleString() + " جنيه";


    cards[5].textContent =
        remaining.toLocaleString() + " جنيه";

}