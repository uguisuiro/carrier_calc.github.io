let globalData = null;
let currentCarrierId = "docomo";
let currentPhases = [];
let selectedReturnMonth = 23;
let currentManualFee = 0;
const fmt = (num) => Number(num).toLocaleString();

async function loadPlans() {
    try {
        const response = await fetch("plans.json");
        globalData = await response.json();
        switchCarrier("docomo");
    } catch (error) {
        console.error("データの読み込みに失敗", error);
    }
}
function toggleInstallmentInput() {
    const type = document.getElementById("paymentType").value;
    const customArea = document.getElementById("customInstallmentArea");

    if (type === "normal") {
        customArea.classList.remove("hide");
    } else {
        customArea.classList.add("hide");
    }
    generateGrid();
    updateCalc();
}
function switchCarrier(carrierId) {
    if (!globalData) return;
    currentCarrierId = carrierId;
    const carrier = globalData.carriers.find(c => c.id === carrierId);
    const deviceSelect = document.getElementById("deviceSelect");

    deviceSelect.innerHTML = '<option value="" disabled selected>機種を選択してください</option>';
    carrier.devices?.forEach(d => {
        const option = document.createElement("option");
        option.value = d.id;
        option.textContent = d.name;
        deviceSelect.appendChild(option);
    });

    renderPlanOptions(carrier.plans);
    renderDiscounts(carrier.discounts);
    renderCarrierOptions(carrier.options);
    onDeviceChange();

    const selects = document.querySelectorAll('select');
    M.FormSelect.init(selects);
}

function renderCarrierOptions(options) {
    const container = document.getElementById("carrierOptionsContainer");
    if (!container || !options) return;
    container.innerHTML = "";
    options.forEach(group => {
        let html = `<label class="small d-block mb-1">${group.category}</label>`;
        if (group.type === "radio") {
            html += `<div class="radio-horizontal-group mb-3">`;
            group.items.forEach((item, idx) => {
                html += `<label><input class="with-gap carrier-opt-input" name="${group.category}" type="radio" value="${item.price}" data-id="${item.id}" data-name="${item.name}" ${idx === 0 ? 'checked' : ''} onchange="updateCalc()"><span>${item.name}</span></label>`;
            });
            html += `</div>`;
        } else {
            html += `<div class="row m-0 mb-3">`;
            group.items.forEach(item => {
                html += `<div class="col s6"><label><input type="checkbox" class="filled-in carrier-opt-input" value="${item.price}" data-id="${item.id}" data-name="${item.name}" onchange="updateCalc()"><span>${item.name}</span></label></div>`;
            });
            html += `</div>`;
        }
        container.insertAdjacentHTML("beforeend", html);
    });
}

function addCustomOptionRow() {
    const container = document.getElementById("customOptionsContainer");
    const rowId = Date.now();
    const html = `<div class="row m-0 align-items-center mb-1" id="custom-opt-${rowId}">
        <div class="input-field col s7 m-0"><input type="text" class="custom-opt-name small" placeholder="サービス名"></div>
        <div class="input-field col s4 m-0"><input type="number" class="custom-opt-price" value="0" oninput="updateCalc()"></div>
        <div class="col s1 m-0"><a href="javascript:void(0)" onclick="this.closest('.row').remove(); updateCalc();" style="color:var(--nord11);">×</a></div>
    </div>`;
    container.insertAdjacentHTML("beforeend", html);
}
function onDeviceChange() {
    const carrier = globalData.carriers.find(c => c.id === currentCarrierId);
    const deviceId = document.getElementById("deviceSelect").value;
    const device = carrier.devices?.find(d => d.id === deviceId);

    if (device) {
        document.getElementById("devicePrice").value = device.lump_sum;
        document.getElementById("manualPhase1").value = device.default_phases[0].price;
        document.getElementById("manualPhase2").value = device.default_phases[1].price;
        document.getElementById("manualPhase3").value = device.default_phases[2].price;
        applyManualSettings();
    }
}

function applyManualSettings() {
    const p1 = Number(document.getElementById("manualPhase1").value) || 0;
    const p2 = Number(document.getElementById("manualPhase2").value) || 0;
    const p3 = Number(document.getElementById("manualPhase3").value) || 0;
    currentManualFee = Number(document.getElementById("manualFee").value) || 0;

    currentPhases = [
        { start: 1, end: 23, price: p1 },
        { start: 24, end: 48, price: p2 },
        { start: 49, end: 99, price: p3 }
    ];
    generateGrid();
    updateCalc();
}

function generateGrid() {
    const container = document.getElementById("paymentGrid");
    if (!container) return;
    container.innerHTML = "";
    const carrier = globalData.carriers.find(c => c.id === currentCarrierId);
    const deviceId = document.getElementById("deviceSelect").value;
    const device = carrier.devices?.find(d => d.id === deviceId);
    const applyBenefit = document.getElementById("applyEarlyBenefit").checked;
    const isUpfront = document.getElementById("isPgUpfront").checked;

    const paymentType = document.getElementById("paymentType")?.value || "program";
    const customCount = Number(document.getElementById("customInstallmentCount")?.value) || 24;
    const installmentLimit = (paymentType === "program") ? 48 : customCount;

    const principal = Math.max(0, Number(document.getElementById("devicePrice")?.value || 0) - (Number(document.getElementById("downPayment").value) || 11000));
    const normalMonthly = Math.floor(principal / customCount);
    for (let m = 1; m <= 48; m++) {
        const price = (paymentType === "normal") ? normalMonthly : getMonthlyDevicePrice(m, device, applyBenefit, isUpfront);;
        const block = document.createElement("div");
        const isInPeriod = (m <= installmentLimit);

        block.className = `payment-block ${m === selectedReturnMonth ? 'active' : ''} ${isInPeriod ? 'in-period' : 'out-of-period'}`;
        if (price <= 1 && isInPeriod) {
            block.style.backgroundColor = "rgba(163, 190, 140, 0.2)";
        }
        block.innerHTML = `<span>${m}</span><b>${price}</b>`;
        if (isInPeriod) {
            block.style.cursor = "pointer";
            block.onclick = () => {
                selectedReturnMonth = m;
                generateGrid();
                updateCalc();
            };
        } else {
            block.style.cursor = "default";
        }
        container.appendChild(block);
    }
}

function getMonthlyDevicePrice(m, device, applyBenefit, isUpfront) {
    const phase = currentPhases.find(p => m >= p.start && m <= p.end);
    let p = phase ? phase.price : 0;
    if (applyBenefit && m >= 1 && m <= 23 && device?.early_use_benefit) {
        p = Math.max(0, p - device.early_use_benefit);
        if (isUpfront) return 0;
    }
    return p;
}

function renderPlanOptions(plans) {
    const planSelect = document.getElementById("planSelect");
    planSelect.innerHTML = `<option value="" disabled selected>プランを選択してください</option>`;

    plans.forEach(plan => {
        if (plan.type === "tiered") {
            plan.tiers.forEach(tier => {
                const option = document.createElement("option");
                option.value = tier.price;
                option.dataset.planId = plan.id;
                option.textContent = `${plan.name}(${tier.label})`;
                planSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = plan.price;
            option.dataset.planId = plan.id;
            option.textContent = plan.name;
            planSelect.appendChild(option);
        }
    });
}

function addPointRow() {
    const container = document.getElementById("storePointsContainer");
    const rowId = Date.now();
    const html = `
        <div class="row m-0 align-items-center mb-2" id="row-${rowId}">
            <div class="input-field col s5 m-0">
                <input type="text" class="store-point-name" placeholder="特典名 (例: 下取り)">
            </div>
            <div class="input-field col s5 m-0">
                <input type="number" class="store-point-value" placeholder="0" oninput="updateCalc()">
            </div>
            <div class="col s2 m-0 text-right">
                <button class="btn-small white grey-text text-darken-2" style="border: 1px solid #9e9e9e;" type="button" onclick="removePointRow(${rowId})">×</button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML("beforeend", html);
}

function removePointRow(id) {
    const row = document.getElementById(`row-${id}`);
    if (row) row.remove();
    updateCalc();
}

function renderDiscounts(discounts) {
    const container = document.getElementById("discountContainer");
    if (!container) return;

    container.innerHTML = "";

    discounts.forEach(d => {
        const html = `
            <div class="mb-2">
                <label>
                    <input class="discount-check" type="checkbox" value="${d.value}" id="${d.id}" data-name="${d.name}">
                    <span>${d.name} (-${fmt(d.value)}円)</span>
                </label>
            </div>
        `;
        container.insertAdjacentHTML("beforeend", html);
    });
    document.querySelectorAll(".discount-check").forEach(check => {
        check.addEventListener("change", updateCalc);
    });
}

function updateCalc() {
    if (!globalData) return;
    const carrier = globalData.carriers.find(c => c.id === currentCarrierId);
    const deviceId = document.getElementById("deviceSelect")?.value || "";
    const device = carrier.devices?.find(d => d.id === deviceId);

    const downPaymentEl = document.getElementById("downPayment");
    const downPayment = downPaymentEl ? Number(downPaymentEl.value) : 11000;
    const planSelect = document.getElementById("planSelect");
    const planPrice = Number(planSelect?.value || 0);

    const selectedPlanId = planSelect.options[planSelect.selectedIndex]?.dataset.planId;
    let totalDiscounts = 0;
    document.querySelectorAll(".discount-check:checked").forEach(check => {
        totalDiscounts += Number(check.value || 0);
    });
    const selectedOptions = [];
    let baseOptionTotal = 0;
    document.querySelectorAll(".carrier-opt-input:checked").forEach(el => {
        const val = Number(el.value);
        baseOptionTotal += val;
        selectedOptions.push({
            id: el.dataset.id, name: el.dataset.name, price: val
        });
    });
    const planData = carrier.plans.find(p => p.id === selectedPlanId);
    let pointBenefit = 0;
    if (planData && planData.point_benefit) {
        pointBenefit = planData.point_benefit;
    }
    let bundlediscount = 0;
    let bundleAppliedNames = [];
    if (planData?.bundle_perks) {
        const perks = planData.bundle_perks;
        const eligibleSelected = selectedOptions.filter(o => perks.eligible_ids.includes(o.id));
        eligibleSelected.sort((a, b) => b.price - a.price);
        const targets = eligibleSelected.slice(0, perks.limit);
        bundlediscount = targets.reduce((sum, item) => sum + item.price, 0);
        bundleAppliedNames = targets.map(i => i.name);
    }
    const statusArea = document.getElementById("bundleStatusArea");
    if (bundleAppliedNames.length > 0) {
        statusArea.classList.remove("d-none");
        document.getElementById("bundleStatusText").innerText = `${bundleAppliedNames.join(', ')} が特典で無料化`;
    } else {
        statusArea.classList.add("d-none");
    }
    let customOptionTotal = 0;
    document.querySelectorAll(".custom-opt-price").forEach(input => {
        customOptionTotal += Number(input.value || 0);
    });
    const paymentType = document.getElementById("paymentType")?.value || "program";
    const customCount = Number(document.getElementById("customInstallmentCount")?.value) || 24;

    const applyBenefit = document.getElementById("applyEarlyBenefit")?.checked || false;
    const isUpfront = document.getElementById("isPgUpfront")?.checked || false;

    let totalStorePoints = 0;
    document.querySelectorAll(".store-point-value").forEach(input => {
        totalStorePoints += Number(input.value || 0);
    });
    let pointUsed = (document.getElementById("isPointApplied")?.checked) ? Math.min(downPayment, totalStorePoints) : 0;
    let finalDown = downPayment - pointUsed;
    let pgFee = 0;

    if (applyBenefit && isUpfront && device?.early_use_benefit) {
        for (let m = 1; m <= 23; m++) {
            const phase = currentPhases.find(p => m >= p.start && m <= p.end);
            pgFee += Math.max(0, (phase?.price || 0) - device.early_use_benefit);
        }
    }

    let cumulativeDevice = 0;
    let currentDeviceMonthly = 0;
    if (paymentType === "program") {
        currentDeviceMonthly = getMonthlyDevicePrice(selectedReturnMonth, device, applyBenefit, isUpfront);
        for (let m = 1; m <= selectedReturnMonth; m++) {
            cumulativeDevice += getMonthlyDevicePrice(m, device, applyBenefit, isUpfront);
        }
    } else if (paymentType === "normal") {
        const principal = Math.max(0, Number(document.getElementById("devicePrice")?.value || 0) - downPayment);
        currentDeviceMonthly = Math.floor(principal / customCount);
        cumulativeDevice = currentDeviceMonthly * Math.min(selectedReturnMonth, customCount);
    } else {
        currentDeviceMonthly = 0;
        cumulativeDevice = Number(document.getElementById("devicePrice")?.value || 0);
    }

    const planNetPrice = Math.max(0, planPrice - totalDiscounts - pointBenefit);
    const optionNetPrice = baseOptionTotal + customOptionTotal - bundlediscount;
    const totalMonthly = currentDeviceMonthly + planNetPrice + optionNetPrice;

    const gridEl = document.getElementById("paymentGrid");
    if (gridEl) {
        gridEl.style.opacity = (paymentType === "program") ? "1" : "0.5";
    }
    const evidenceTemplate = `
【月々の支払額（${paymentType === "program" ? selectedReturnMonth + 'ヶ月目' : '任意分割'}）】
端末分割金: ${fmt(currentDeviceMonthly)} 円
プラン料金: ${fmt(planPrice)} 円
各種割引: -${fmt(totalDiscounts)} 円
${pointBenefit > 0 ? `プラン特典(ポイ活等): -${fmt(pointBenefit)} 円\n` : ''}オプション: ${fmt(optionNetPrice)} 円
---------------------------
月々支払合計: ${fmt(totalMonthly)} 円/月

【店頭支払額】
事務手数料: ${fmt(3850)} 円
頭金 (定価): ${fmt(downPayment)} 円
ポイント充当: -${fmt(pointUsed)} pt
${isUpfront ? `PG早期利用料金(一括): ${fmt(pgFee)} 円\n` : ''}---------------------------
店頭支払合計: ${fmt(finalDown + 3850 + (pgFee))} 円

【端末代金計算】
端末総額: ${fmt(Number(document.getElementById("devicePrice")?.value || 0))} 円
頭金引後: ${fmt(Math.max(0, Number(document.getElementById("devicePrice")?.value || 0) - downPayment))} 円

【ポイント還元】
独自ポイント合計: ${fmt(totalStorePoints)} pt
頭金へ充当: ${fmt(pointUsed)} pt
残ポイント: ${fmt(totalStorePoints - pointUsed)} pt 

【シミュレーション根拠】
${paymentType === "program" ? '返却予定: ' + selectedReturnMonth + ' ヶ月目' : '分割回数: ' + customCount + ' 回'}
端末代累計負担額: ${fmt(cumulativeDevice + pgFee + currentManualFee)} 円
(分割手数料 ${fmt(currentManualFee)} 円含む)
    `;
    const area = document.getElementById("evidenceArea");
    if (area) area.innerText = evidenceTemplate;

    const pgArea = document.getElementById("pgUpfrontArea");
    if (pgArea) {
        if (applyBenefit && device?.early_use_benefit) pgArea.classList.remove("d-none");
        else pgArea.classList.add("d-none");
    }
}

document.addEventListener("DOMContentLoaded", loadPlans);