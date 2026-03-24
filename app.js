let globalData = null;
let currentCarrierId = "docomo";
let currentPhases = [];
let selectedReturnMonth = 23;
let currentManualFee = 0;
let currentSplitCount = 23;
let currentTotalCount = 48;

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
    const paymentSelect = document.getElementById("paymentType");
    const selectedOption = paymentSelect.options[paymentSelect.selectedIndex];
    if (!selectedOption) return;

    const paymentTypeFlag = selectedOption.dataset.type;
    const customArea = document.getElementById("customInstallmentArea");

    const residualArea = document.getElementById("residualValueArea");
    const programPhasesArea = document.getElementById("programPhasesArea");

    if (paymentTypeFlag === "normal") {
        customArea.classList.remove("hide");
        residualArea.classList.add("d-none");
        programPhasesArea.classList.add("d-none");
    } else if (paymentTypeFlag === "lump") {
        customArea.classList.add("hide");
        residualArea.classList.add("d-none");
        programPhasesArea.classList.add("d-none");
    } else if (paymentTypeFlag === "program") {
        customArea.classList.add("hide");
        residualArea.classList.remove("d-none");
        programPhasesArea.classList.remove("d-none");

        currentSplitCount = Number(selectedOption.dataset.splitCount) || 23;
        currentTotalCount = Number(selectedOption.dataset.totalCount) || 48;
        selectedReturnMonth = currentSplitCount;

        const p1Label = document.getElementById("phase1Label");
        const p2Label = document.getElementById("phase2Label");
        const p3Label = document.getElementById("phase3Label");

        if (p1Label) p1Label.textContent = `1〜${currentSplitCount}回目`;
        if (p2Label) p2Label.textContent = `${currentSplitCount + 1}〜${currentTotalCount}回目`;
        if (p3Label) p3Label.textContent = `${currentTotalCount + 1}回目〜`;
    }
    const headerEl = document.getElementById("paymentSettingHeader");
    if (headerEl) {
        if (paymentTypeFlag === "program") {
            headerEl.textContent = "端末価格とプログラムの設定";
        } else if (paymentTypeFlag === "normal") {
            headerEl.textContent = "端末価格と分割払いの設定";
        } else if (paymentTypeFlag === "lump") {
            headerEl.textContent = "端末価格（一括払い）の設定";
        }
    }
    if (paymentTypeFlag === "program") {
        autoCalculatePhases();
    } else {
        applyManualSettings();
    }

}

function autoCalculatePhases() {
    const paymentSelect = document.getElementById("paymentType");
    const paymentTypeFlag = paymentSelect?.options[paymentSelect.selectedIndex]?.dataset.type || "program";
    const devicePrice = Number(document.getElementById("devicePrice").value) || 0;
    const residualValue = Number(document.getElementById("residualValue").value) || 0;
    if (paymentTypeFlag === "program") {
        let phase1Price = Math.floor(Math.max(0, devicePrice - residualValue) / currentSplitCount);
        let remainingMonths = currentTotalCount - currentSplitCount;
        let phase2Price = remainingMonths > 0 ? Math.floor(residualValue / remainingMonths) : 0;

        document.getElementById("manualPhase1").value = phase1Price;
        document.getElementById("manualPhase2").value = phase2Price;
        document.getElementById("manualPhase3").value = 0;

        applyManualSettings();
    }
}
function switchCarrier(carrierId) {
    if (!globalData) return;
    currentCarrierId = carrierId;
    const carrier = globalData.carriers.find(c => c.id === carrierId);
    const deviceSelect = document.getElementById("deviceSelect");

    deviceSelect.innerHTML = `
        <option value="" disabled selected>機種を選択してください</option>
        <option value="none">端末購入なし（SIM・eSIMのみ契約）</option>
    `;
    if (globalData.devices) {
        const availableDevices = globalData.devices.filter(d =>
            d.storage_by_carrier && d.storage_by_carrier[carrierId]
        );
        availableDevices.forEach(d => {
            const option = document.createElement("option");
            option.value = d.id;
            option.textContent = d.name;
            deviceSelect.appendChild(option);
        });
    }

    renderPlanOptions(carrier.plans);
    renderDiscounts(carrier.discounts);
    renderCarrierOptions(carrier.options);
    let availablePrograms = [];
    if (globalData.programs) {
        availablePrograms = globalData.programs.filter(
            p => p.carrier === carrierId || p.carrier === "all"
        );
    }
    if (carrier.programs) {
        availablePrograms = availablePrograms.concat(carrier.programs);
    }
    renderPaymentOptions(availablePrograms);
    onDeviceChange();

    const selects = document.querySelectorAll('select');
    M.FormSelect.init(selects);
}

function renderCarrierOptions(options) {
    const container = document.getElementById("carrierOptionsContainer");
    if (!container || !options) return;
    container.innerHTML = "";
    options.forEach((group, groupIndex) => {
        let html = `<label class="small d-block mb-1">${group.category}</label>`;

        const freqItems = group.items.filter(item => item.frequency !== "notfreq");
        const notFreqItems = group.items.filter(item => item.frequency == "notfreq");

        if (group.type === "radio") {
            html += `<div class="radio-horizontal-group mb-3">`;
            freqItems.forEach((item, idx) => {
                html += `<div style="display: inline-flex; align-items: center; margin-right: 15px;">
                    <label style="margin-right: 4px;">
                        <input class="with-gap carrier-opt-input" name="${group.category}" type="radio" value="${item.price || 0}" data-id="${item.id}" data-name="${item.name}" ${idx === 0 ? 'checked' : ''} onchange="updateCalc()">
                        <span>${item.name}</span>
                    </label>
                    <span class="small" style="color: var(--text-muted);">(<input type="number" value="${item.price || 0}" style="width: 50px; height: 1.5rem; margin: 0 4px; padding: 0; text-align: right; border-bottom: 1px dashed var(--nord4) !important;" oninput="this.closest('div').querySelector('.carrier-opt-input').value = this.value; updateCalc();">円)</span>
                </div>`;
            });
            html += `</div>`;
            if (notFreqItems.length > 0) {
                html += `<div class="toggle-notfreq-btn" style="cursor: pointer; color: var(--primary-color); font-size: 0.85rem; margin-bottom: 8px; user-select: none;" onclick="toggleNotFreq('notfreq-radio-${groupIndex}', this)">+ その他のオプションを表示</div>`;

                html += `<div id="notfreq-radio-${groupIndex}" class="radio-horizontal-group mb-3" style="display: none;">`;
                notFreqItems.forEach(item => {
                    html += `<div style="display: inline-flex; align-items: center; margin-right: 15px;">
                        <label style="margin-right: 4px;">
                            <input class="with-gap carrier-opt-input" name="${group.category}" type="radio" value="${item.price || 0}" data-id="${item.id}" data-name="${item.name}" onchange="updateCalc()">
                            <span>${item.name}</span>
                        </label>
                        <span class="small" style="color: var(--text-muted);">(<input type="number" value="${item.price || 0}" style="width: 50px; height: 1.5rem; margin: 0 4px; padding: 0; text-align: right; border-bottom: 1px dashed var(--nord4) !important;" oninput="this.closest('div').querySelector('.carrier-opt-input').value = this.value; updateCalc();">円)</span>
                    </div>`;
                });
                html += `</div>`;
            }
        } else {
            html += `<div class="row m-0 mb-3">`;
            freqItems.forEach(item => {
                html += `<div class="col s6 mb-1">
                    <div style="display: flex; align-items: center; flex-wrap: wrap;">
                        <label style="margin-right: 4px;">
                            <input type="checkbox" class="filled-in carrier-opt-input" value="${item.price || 0}" data-id="${item.id}" data-name="${item.name}" onchange="updateCalc()">
                            <span>${item.name}</span>
                        </label>
                        <span class="small" style="color: var(--text-muted);">(<input type="number" value="${item.price || 0}" style="width: 50px; height: 1.5rem; margin: 0 2px; padding: 0; text-align: right; border-bottom: 1px dashed var(--nord4) !important;" oninput="this.closest('div').querySelector('.carrier-opt-input').value = this.value; updateCalc();">円)</span>
                    </div>
                </div>`;
            });
            html += `</div>`;

            if (notFreqItems.length > 0) {
                html += `<div class="toggle-notfreq-btn" style="cursor: pointer; color: var(--primary-color); font-size: 0.85rem; margin-bottom: 8px; user-select: none;" onclick="toggleNotFreq('notfreq-chk-${groupIndex}', this)">+ その他のオプションを表示</div>`;
                html += `<div id="notfreq-chk-${groupIndex}" class="row m-0 mb-3" style="display: none;">`;
                notFreqItems.forEach(item => {
                    html += `<div class="col s6 mb-1">
                        <div style="display: flex; align-items: center; flex-wrap: wrap;">
                            <label style="margin-right: 4px;">
                                <input type="checkbox" class="filled-in carrier-opt-input" value="${item.price || 0}" data-id="${item.id}" data-name="${item.name}" onchange="updateCalc()">
                                <span>${item.name}</span>
                            </label>
                            <span class="small" style="color: var(--text-muted);">(<input type="number" value="${item.price || 0}" style="width: 50px; height: 1.5rem; margin: 0 2px; padding: 0; text-align: right; border-bottom: 1px dashed var(--nord4) !important;" oninput="this.closest('div').querySelector('.carrier-opt-input').value = this.value; updateCalc();">円)</span>
                        </div>
                    </div>`;
                });
                html += `</div>`;
            }
        }
        container.insertAdjacentHTML("beforeend", html);
    });
}

function toggleNotFreq(targetId, btn) {
    const target = document.getElementById(targetId);
    if (target.style.display == "none") {
        target.style.display = "";
        btn.innerHTML = "閉じる"
    } else {
        target.style.display = "none";
        btn.innerHTML = "その他のオプションの表示"
    }
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
    const deviceId = document.getElementById("deviceSelect").value;
    const device = globalData.devices?.find(d => d.id === deviceId);

    const storageSelectArea = document.getElementById("storageSelectArea");
    const storageSelect = document.getElementById("storageSelect");

    if (device && deviceId !== "none" && device.storage_by_carrier && device.storage_by_carrier[currentCarrierId]) {
        storageSelectArea.style.display = "block";
        storageSelect.innerHTML = "";

        const storages = device.storage_by_carrier[currentCarrierId];
        storages.forEach(storage => {
            const option = document.createElement("option");
            option.value = storage;
            option.textContent = storage;
            storageSelect.appendChild(option);
        });
    } else {
        storageSelectArea.style.display = "none";
        storageSelect.innerHTML = "";
    }
    const selects = document.querySelectorAll('select');
    M.FormSelect.init(selects);
    document.getElementById("devicePrice").value = 0;
    autoCalculatePhases();
    applyManualSettings();
}

function applyManualSettings() {
    const p1 = Number(document.getElementById("manualPhase1").value) || 0;
    const p2 = Number(document.getElementById("manualPhase2").value) || 0;
    const p3 = Number(document.getElementById("manualPhase3").value) || 0;
    currentManualFee = Number(document.getElementById("manualFee").value) || 0;

    currentPhases = [
        { start: 1, end: currentSplitCount, price: p1 },
        { start: currentSplitCount + 1, end: currentTotalCount, price: p2 },
        { start: currentTotalCount + 1, end: 99, price: p3 }
    ];
    generateGrid();
    updateCalc();
}
function renderPaymentOptions(programs) {
    const paymentSelect = document.getElementById("paymentType");
    if (!paymentSelect) return;

    paymentSelect.innerHTML = "";
    if (programs) {
        programs.forEach((prog) => {
            const option = document.createElement("option");
            option.value = prog.id;
            option.dataset.splitCount = prog.split_count || 23;
            option.dataset.totalCount = prog.total_count || 48;
            option.textContent = prog.name;
            paymentSelect.appendChild(option);
        });
    }
    const normalOption = document.createElement("option");
    normalOption.value = "normal";
    normalOption.dataset.type = "normal";
    normalOption.textContent = "標準的な分割";
    paymentSelect.appendChild(normalOption);

    const lumpOption = document.createElement("option");
    lumpOption.value = "lump";
    lumpOption.dataset.type = "lump";
    lumpOption.textContent = "一括払い";
    paymentSelect.appendChild(lumpOption);
    paymentSelect.selectedIndex = 0;
    toggleInstallmentInput();
}
function generateGrid() {
    const container = document.getElementById("paymentGrid");
    if (!container) return;
    container.innerHTML = "";
    const carrier = globalData.carriers.find(c => c.id === currentCarrierId);
    const deviceId = document.getElementById("deviceSelect").value;
    const device = globalData.devices?.find(d => d.id === deviceId);
    const applyBenefit = document.getElementById("applyEarlyBenefit").checked;
    const isUpfront = document.getElementById("isPgUpfront").checked;

    const paymentSelect = document.getElementById("paymentType");
    const paymentType = paymentSelect?.options[paymentSelect.selectedIndex]?.dataset.type || "program";
    const customCount = Number(document.getElementById("customInstallmentCount")?.value) || 24;
    const installmentLimit = (paymentType === "program") ? currentTotalCount : customCount;
    const principal = Math.max(0, Number(document.getElementById("devicePrice")?.value || 0) - (Number(document.getElementById("downPayment").value) || 11000));
    const normalMonthly = Math.floor(principal / customCount);
    for (let m = 1; m <= installmentLimit; m++) {
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
    if (applyBenefit && m >= 1 && m <= currentSplitCount && device?.early_use_benefit) {
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
            <div class="mb-2" style="display: flex; align-items: center; flex-wrap: wrap;">
                <label style="margin-right: 8px;">
                    <input class="discount-check" type="checkbox" value="${d.value}" id="${d.id}" data-name="${d.name}">
                    <span>${d.name}</span>
                </label>
                <span class="small" style="color: var(--text-muted); display: inline-flex; align-items: center;">
                    (-<input type="number" value="${d.value}" style="width: 60px; height: 1.5rem; margin: 0 4px; text-align: right; color: var(--nord11);" oninput="document.getElementById('${d.id}').value = this.value; updateCalc();">円)
                </span>
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
    const device = globalData.devices?.find(d => d.id === deviceId);

    const downPaymentEl = document.getElementById("downPayment");
    const downPayment = downPaymentEl ? Number(downPaymentEl.value) : 11000;
    const planSelect = document.getElementById("planSelect");
    const planPrice = Number(planSelect?.value || 0);
    const selectedPlanId = planSelect.options[planSelect.selectedIndex]?.dataset.planId;
    let planNameStr = "未選択";
    if (planSelect.selectedIndex >= 0) {
        planNameStr = planSelect.options[planSelect.selectedIndex].textContent;
    }
    let fullDeviceName = "端末購入なし";
    if (device) {
        const storageSelect = document.getElementById("storageSelect");
        const storageSelectArea = document.getElementById("storageSelectArea");
        const storageStr = (storageSelect && storageSelectArea.style.display !== "none" && storageSelect.value) ? ` (${storageSelect.value})` : "";
        fullDeviceName = device.name + storageStr;
    }
    let totalDiscounts = 0;
    const appliedDiscounts = [];
    document.querySelectorAll(".discount-check:checked").forEach(check => {
        const val = Number(check.value || 0);
        totalDiscounts += val;
        appliedDiscounts.push(`${check.dataset.name}: -${fmt(val)}円`);
    });
    const discountText = appliedDiscounts.length > 0 ? appliedDiscounts.join("\n  ") : "なし";

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
    const customOptionsList = [];

    document.querySelectorAll(".custom-opt-price").forEach(input => {
        const val = Number(input.value || 0);
        customOptionTotal += val;
        const nameInput = input.closest('.row').querySelector('.custom-opt-name');
        const optName = (nameInput && nameInput.value) ? nameInput.value : "自由入力オプション";
        if (val > 0) customOptionsList.push(`${optName}: +${fmt(val)}円`);
    });
    const optionDisplayList = [];
    selectedOptions.forEach(opt => {
        if (bundleAppliedNames.includes(opt.name)) {
            optionDisplayList.push(`${opt.name}: 無料特典`);
        } else if (opt.price > 0) {
            optionDisplayList.push(`${opt.name}: +${fmt(opt.price)}円`);
        }
    });

    customOptionsList.forEach(opt => optionDisplayList.push(opt));
    const optionText = optionDisplayList.length > 0 ? optionDisplayList.join("\n ") : "なし";
    const paymentSelect = document.getElementById("paymentType");
    const paymentType = paymentSelect?.options[paymentSelect.selectedIndex]?.dataset.type || "program";
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
        for (let m = 1; m <= currentSplitCount; m++) {
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
【ご契約内容】
機種: ${fullDeviceName}
プラン: ${planNameStr}

【月々の支払額（${paymentType === "program" ? selectedReturnMonth + 'ヶ月目' : '任意分割'}）】
端末分割金: ${fmt(currentDeviceMonthly)} 円
プラン基本料: ${fmt(planPrice)} 円

[適用中の割引]
  ${discountText}
  (割引小計: -${fmt(totalDiscounts)} 円)

[加入オプション]
  ${optionText}
  (オプション小計: +${fmt(optionNetPrice)} 円)
${pointBenefit > 0 ? `\n[プラン特典(ポイ活等)]\n  -${fmt(pointBenefit)} 円\n` : ''}
---------------------------
月々支払合計: ${fmt(totalMonthly)} 円/月

【店頭支払額】
事務手数料: ${fmt(3850)} 円
頭金 (定価): ${fmt(downPayment)} 円
ポイント充当: -${fmt(pointUsed)} pt
${isUpfront ? `PG早期利用料金(一括): ${fmt(pgFee)} 円\n` : ''}---------------------------
店頭支払合計: ${fmt(finalDown + 3850 + (pgFee))} 円

【端末代金計算】
端末一括価格: ${fmt(Number(document.getElementById("devicePrice")?.value || 0))} 円
頭金充当後残額: ${fmt(Math.max(0, Number(document.getElementById("devicePrice")?.value || 0) - downPayment))} 円

【店舗ポイント還元】
独自特典合計: ${fmt(totalStorePoints)} pt
頭金へ充当済: -${fmt(pointUsed)} pt
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