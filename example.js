"strict mode";

// 1) 申请悬浮窗权限
if (!floaty.checkPermission()) {
  floaty.requestPermission();
  while (!floaty.checkPermission()) sleep(300);
}
try { auto.waitFor(); } catch (e) {}

// 2) 默认坐标与状态
var x = 500, y = 1000;
var clicking = false;
var clickThread = null;
var rzk = 0;
var selecting = false; // 是否正在等待用户下一次触控以记录坐标
var history = [];     // 坐标历史记录 [{x,y,time}]
var selectTimer = null; // 选择模式超时计时器
var storage = storages.create("auto_clicker");
// 新增：触摸记录相关
var recording = false;           // 是否正在记录所有触摸
var touchRecords = [];           // 触摸记录 [{x,y,time}]

// 共享坐标（线程安全）- 移除旧的 x,y 变量依赖
const AtomicInteger = java.util.concurrent.atomic.AtomicInteger;
var ax = new AtomicInteger(500);  // 直接初始化，不依赖 x
var ay = new AtomicInteger(1000); // 直接初始化，不依赖 y
var interval = 500;
// 调试：自动应用输入框变化 & 点击坐标变更日志
var _autoInputWatcherStarted = false;

function saveState() {
  try {
    storage.put("history", history);
    storage.put("xy", { x: ax.get(), y: ay.get() });
  } catch (e) {}
}

function loadState() {
  try {
    var h = storage.get("history", []);
    if (Array.isArray(h)) history = h;
    var xy = storage.get("xy");
    if (xy && typeof xy.x === "number" && typeof xy.y === "number") {
      ax.set(xy.x);
      ay.set(xy.y);
    }
  } catch (e) {}
  updateXYShow();
}

function setWindowTouchable(t) { try { window.setTouchable(t); } catch (e) {} }

// 3) 悬浮窗
var window = floaty.window(
  <frame>
    <vertical bg="#263238" alpha="0.96" padding="10" w="*">
      <horizontal gravity="center_vertical">
        <img id="floaty_icon"
             src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
             bg="#4CAF50" w="48" h="48" radius="24" margin="0 12 0 0"/>
        <vertical id="h_drawer" visibility="gone" w="0" layout_weight="1">
          <text text="自动点击器" textColor="#FFFFFF" textSize="17sp" gravity="center" margin="0 0 6 0"/>

          <vertical bg="#37474F" padding="8" radius="6">
            <horizontal gravity="center_vertical">
              <horizontal w="0" layout_weight="1" gravity="center_vertical">
                <text text="X" textColor="#B0BEC5" textSize="12sp"/>
                <input id="valX" text="500" w="0" layout_weight="1" gravity="center" textColor="#FFFFFF" textSize="13sp" bg="#455A64" padding="4 3" margin="6 0 0 6" focusable="true" singleLine="true"/>
              </horizontal>
              <horizontal w="8"/>
              <horizontal w="0" layout_weight="1" gravity="center_vertical">
                <text text="Y" textColor="#B0BEC5" textSize="12sp"/>
                <input id="valY" text="1000" w="0" layout_weight="1" gravity="center" textColor="#FFFFFF" textSize="13sp" bg="#455A64" padding="4 3" margin="6 0 0 6" focusable="true" singleLine="true"/>
              </horizontal>
            </horizontal>
            <text id="xyShow" text="坐标: (500, 1000)" textColor="#ECEFF1" textSize="11sp" gravity="center" margin="6 0 0 0"/>
          </vertical>

          <text id="preview" text="" textColor="#FFB74D" textSize="11sp" gravity="center" margin="6 0 0 0"/>

          <horizontal h="1" bg="#37474F" margin="8 0 8 0"/>

          <vertical id="btn_panel" bg="#37474F" padding="6" radius="6">
            <horizontal>
              <button id="ui_start"  text="开始" w="0" layout_weight="1" h="42" textSize="13sp" bg="#4CAF50"  textColor="#FFFFFF" margin="0 4 0 0"/>
              <button id="ui_select" text="选点" w="0" layout_weight="1" h="42" textSize="13sp" bg="#FFC107" textColor="#263238" margin="0 4 0 0"/>
              <button id="ui_history" text="历史" w="0" layout_weight="1" h="42" textSize="13sp" bg="#9C27B0" textColor="#FFFFFF" margin="0 4 0 0"/>
            </horizontal>
            <horizontal margin="6 0 0 0">
              <button id="ui_log"   text="日志" w="0" layout_weight="1" h="42" textSize="13sp" bg="#2196F3" textColor="#FFFFFF" margin="0 4 0 0"/>
              <button id="ui_record" text="暂停" w="0" layout_weight="1" h="42" textSize="13sp" bg="#607D8B" textColor="#FFFFFF" margin="0 4 0 0"/>
              <button id="ui_close" text="关闭" w="0" layout_weight="1" h="42" textSize="13sp" bg="#F44336" textColor="#FFFFFF" margin="0 4 0 0"/>

            </horizontal>
          </vertical>

          <text id="status" text="未开始" textColor="#FFFFFF" textSize="12sp" gravity="center" bg="#455A64" padding="6" margin="10 0 0 0" radius="4"/>
        </vertical>
      </horizontal>
    </vertical>
  </frame>
);

// 初始位置与抽屉状态
window.setPosition(50, device.height / 3);
window.h_drawer.visibility = 8;
loadState();

// 4) 拖拽图标与抽屉开关
var touchX = 0, touchY = 0, windowX = 0, windowY = 0;
window.floaty_icon.setOnTouchListener(function (view, event) {
  switch (event.getAction()) {
    case event.ACTION_DOWN:
      touchX = event.getRawX();
      touchY = event.getRawY();
      windowX = window.getX();
      windowY = window.getY();
      return true;
    case event.ACTION_MOVE:
      let moveX = windowX + (event.getRawX() - touchX);
      let moveY = windowY + (event.getRawY() - touchY);
      moveX = Math.max(0, Math.min(moveX, device.width - 100));
      moveY = Math.max(0, Math.min(moveY, device.height - 100));
      window.setPosition(moveX, moveY);
      return true;
    case event.ACTION_UP:
      if (Math.abs(event.getRawY() - touchY) < 5 && Math.abs(event.getRawX() - touchX) < 5) {
        toggleDrawer();
      }
      return true;
  }
  return true;
});

function toggleDrawer() {
  if (window.h_drawer.visibility == 8) {
    window.h_drawer.visibility = 0;
    updateXYShow();
  } else {
    window.h_drawer.visibility = 8;
  }
}

function updateXYShow() {
  if (!window || !window.valX) return;
  ui.run(() => {
    try {
      var cx = ax.get(), cy = ay.get();
      window.xyShow.setText("坐标: (" + cx + ", " + cy + ")");
      var fx = (typeof window.valX.hasFocus === 'function') ? window.valX.hasFocus() : false;
      var fy = (typeof window.valY.hasFocus === 'function') ? window.valY.hasFocus() : false;
      if (!fx) window.valX.setText(String(cx));
      if (!fy) window.valY.setText(String(cy));
    } catch (e) {}
  });
}

// 设置坐标的统一函数 - 增加边界检查
function setCoord(nx, ny, opts) {
  var changed = false;
  
  // 边界检查：确保坐标在屏幕范围内
  if (typeof nx === "number" && nx > 0 && nx < device.width && nx !== ax.get()) { 
    ax.set(nx); 
    changed = true; 
  }
  if (typeof ny === "number" && ny > 0 && ny < device.height && ny !== ay.get()) { 
    ay.set(ny); 
    changed = true; 
  }
  
  if (changed) updateXYShow();
  if (opts && opts.save) saveState();
  if (changed) console.log("[coord] 已更新坐标 -> (" + ax.get() + "," + ay.get() + ") 屏幕:" + device.width + "x" + device.height);
}

// 兼容提取触控坐标（不同版本可能是 getRawX/getX 或 x 字段）
function getTouchXY(p) {
  var rx = 0, ry = 0;
  try {
    if (!p) return [0, 0];
    if (typeof p.getRawX === "function") { rx = p.getRawX(); ry = p.getRawY(); }
    else if (typeof p.getX === "function") { rx = p.getX(); ry = p.getY(); }
    else if (typeof p.x === "number" && typeof p.y === "number") { rx = p.x; ry = p.y; }
  } catch (e) {}
  return [Math.round(rx), Math.round(ry)];
}

// 解析数字输入（支持算式）- 修复清空变0的bug
function evalInt(str, defVal) {
  if (str == null) return defVal;
  str = String(str).trim();
  if (str === "") return defVal; // 空字符串返回默认值，不是0
  // 允许简单算式 1+2*3
  if (/^[\d+\-*/().\s]+$/.test(str)) {
    try {
      var v = Math.round(Number(eval(str)));
      return isFinite(v) && v > 0 ? v : defVal; // 确保坐标为正数
    } catch (e) { return defVal; }
  }
  var n = parseInt(str, 10);
  return (isNaN(n) || n <= 0) ? defVal : n; // 确保坐标为正数
}

// 启动选择模式
function startSelectMode() {
  toast("请点击你想要的屏幕位置...");
  selecting = true;
  ui.run(() => {
    if (window.h_drawer.visibility == 0) window.h_drawer.visibility = 8; // 收起抽屉，避免遮挡
    setWindowTouchable(false); // 让点击穿透到屏幕
  });
  if (selectTimer) clearTimeout(selectTimer);
  selectTimer = setTimeout(() => {
    if (selecting) {
      selecting = false;
      ui.run(() => setWindowTouchable(true));
      toast("选择已超时");
    }
  }, 8000);
}

// 新增：从输入框读取并应用坐标
function applyInputValues(opts){
  try {
    var tx = ("" + window.valX.text()).trim();
    var ty = ("" + window.valY.text()).trim();
    var nx = evalInt(tx, ax.get());
    var ny = evalInt(ty, ay.get());
    setCoord(nx, ny, { save: opts && opts.save });
    if (clicking) ui.run(() => window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")"));
  } catch(e) {}
}
// 输入框事件绑定（获得焦点、按键提交、失焦提交）
try {
  [window.valX, window.valY].forEach(function(inp){
    inp.on("touch_down", ()=>{ try { window.requestFocus(); inp.requestFocus(); } catch(e){} });
    inp.on("key", function(keyCode, event){
      if (event.getAction() == event.ACTION_DOWN){
        if (keyCode == keys.enter || keyCode == keys.back){
          applyInputValues({ save: true });
          window.disableFocus();
          event.consumed = true;
        }
      }
    });
    try { inp.on("focus_change", (has)=>{ if(!has) applyInputValues({ save: true }); }); } catch(e) {}
  });
  // 启动输入轮询（防止用户只改数字但未回车/失焦导致未应用）
  if (!_autoInputWatcherStarted) {
    _autoInputWatcherStarted = true;
    var _lastTx = "", _lastTy = "";
    var _inputStableCount = 0;
    setInterval(()=>{
      try {
        var tx = ("" + window.valX.text()).trim();
        var ty = ("" + window.valY.text()).trim();
        
        // 检查输入是否稳定（连续3次相同才应用，避免输入过程中频繁触发）
        if (tx === _lastTx && ty === _lastTy) {
          _inputStableCount++;
          if (_inputStableCount >= 3) { // 输入稳定1.2秒后应用
            var nx = evalInt(tx, ax.get());
            var ny = evalInt(ty, ay.get());
            if (nx !== ax.get() || ny !== ay.get()) {
              console.log("[input-watcher] 检测到输入变化: " + tx + "," + ty + " -> (" + nx + "," + ny + ")");
              setCoord(nx, ny, { save: false });
            }
            _inputStableCount = 0; // 重置计数器
          }
        } else {
          _lastTx = tx; _lastTy = ty;
          _inputStableCount = 0; // 输入变化时重置
        }
      } catch(e) {}
    }, 400);
  }
} catch(e) {}
// xyShow 长按快速提交（防止还没失焦就被覆盖）
try { window.xyShow.on("long_click", ()=>{ applyInputValues({ save: true }); toast("已应用输入"); }); } catch(e) {}

// 绑定事件：点数字弹窗输入；长按整行同时输入X/Y (已废弃)
// (旧) window.valX.on("click", editX);
// (旧) window.valY.on("click", editY;

// 坐标本地文件保存
function saveCoordToFile(x, y, name) {
  try {
    var logFile = "/sdcard/AutoClicker_coords.txt";
    var timestamp = new Date().toLocaleString();
    var coordName = name || "坐标" + Date.now();
    var logLine = timestamp + " | " + coordName + " | (" + x + "," + y + ")\n";
    files.append(logFile, logLine);
    console.log("[file-save] 已保存到文件: " + logLine.trim());
    return true;
  } catch (e) {
    console.log("[file-save] 保存失败: " + e.message);
    return false;
  }
}

// 从文件读取所有坐标记录
function loadCoordsFromFile() {
  try {
    var logFile = "/sdcard/AutoClicker_coords.txt";
    if (!files.exists(logFile)) return [];
    var content = files.read(logFile);
    var lines = content.split('\n').filter(line => line.trim());
    var coords = [];
    lines.forEach(line => {
      var match = line.match(/^(.+?) \| (.+?) \| \((\d+),(\d+)\)$/);
      if (match) {
        coords.push({
          time: match[1],
          name: match[2],
          x: parseInt(match[3]),
          y: parseInt(match[4]),
          raw: line
        });
      }
    });
    return coords.reverse(); // 最新的在前
  } catch (e) {
    console.log("[file-load] 读取失败: " + e.message);
    return [];
  }
}

// 选择位置：等待下一次触屏获取坐标并保存到文件
window.ui_select.on("click", () => {
  var coordName = dialogs.input("坐标名称", "请输入坐标名称（可选）", "坐标_" + new Date().getHours() + "_" + new Date().getMinutes());
  if (coordName === null) return;
  if (!coordName.trim()) coordName = "坐标_" + Date.now();
  
  pendingCoordName = coordName.trim();
  startSelectMode();
  toast("请点击屏幕选择坐标...");
});

// 全局触控监听 - 选点模式
events.observeTouch();
var pendingCoordName = "";
events.on("touch", function (p) {
  // 选点模式：仅处理一次
  if (!selecting) return;
  selecting = false;
  if (selectTimer) { try { clearTimeout(selectTimer); } catch (e) {} selectTimer = null; }
  var xy = getTouchXY(p);
  var rx = xy[0], ry = xy[1];
  ui.run(() => setWindowTouchable(true));
  
  threads.start(() => {
    var ok = dialogs.confirm("确认坐标", "使用该坐标: (" + rx + ", " + ry + ")?");
    if (ok) {
      // 设置当前坐标
      setCoord(rx, ry, { save: true });
      
      // 保存到文件和内存历史
      var coordName = pendingCoordName || ("坐标_" + new Date().getHours() + "_" + new Date().getMinutes());
      saveCoordToFile(rx, ry, coordName);
      
      // 同时保存到内存历史（向后兼容）
      try {
        history.push({ x: rx, y: ry, time: new Date().toLocaleString(), name: coordName });
        if (history.length > 30) history.shift();
        saveState();
      } catch (e) {}
      
      if (clicking) ui.run(() => window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")"));
      toast("已保存坐标: " + coordName + " (" + rx + ", " + ry + ")");
    } else {
      toast("已取消");
    }
    pendingCoordName = "";
  });
});

// 历史记录选择 - 从文件读取所有坐标
window.ui_history && window.ui_history.on("click", () => {
  try {
    var fileCoords = loadCoordsFromFile();
    var memoryCoords = history || [];
    
    var items = ["📝 手动输入坐标"];
    var allCoords = [];
    
    // 添加文件中的坐标
    fileCoords.forEach((coord, i) => {
      items.push("📁 " + coord.name + " (" + coord.x + "," + coord.y + ") " + coord.time);
      allCoords.push(coord);
    });
    
    // 添加内存中的坐标（如果不重复）
    memoryCoords.forEach((coord, i) => {
      var isDuplicate = fileCoords.some(fc => fc.x === coord.x && fc.y === coord.y);
      if (!isDuplicate) {
        items.push("💾 " + (coord.name || "坐标") + " (" + coord.x + "," + coord.y + ") " + coord.time);
        allCoords.push(coord);
      }
    });
    
    if (items.length === 1) {
      toast("暂无历史记录");
      return;
    }
    
    var idx = dialogs.select("选择坐标", items);
    if (idx < 0) return;
    
    if (idx === 0) {
      // 手动输入
      var input = dialogs.input("手动输入", "请输入坐标，格式: x,y", ax.get() + "," + ay.get());
      if (!input) return;
      
      var parts = input.trim().split(',');
      if (parts.length !== 2) {
        toast("格式错误，请使用 x,y 格式");
        return;
      }
      
      var x = parseInt(parts[0].trim());
      var y = parseInt(parts[1].trim());
      if (isNaN(x) || isNaN(y)) {
        toast("坐标必须是数字");
        return;
      }
      
      // 询问是否保存
      var saveName = dialogs.input("保存坐标", "是否保存此坐标？请输入名称（留空不保存）", "手动_" + x + "_" + y);
      if (saveName && saveName.trim()) {
        saveCoordToFile(x, y, saveName.trim());
      }
      
      setCoord(x, y, { save: true });
      toast("已设置坐标: (" + x + ", " + y + ")");
    } else {
      // 从历史选择
      var selected = allCoords[idx - 1];
      setCoord(selected.x, selected.y, { save: true });
      toast("已应用: " + (selected.name || "坐标") + " (" + selected.x + ", " + selected.y + ")");
    }
    
    if (clicking) ui.run(() => window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")"));
  } catch (e) {
    toast("操作失败: " + e.message);
  }
});

// 6) 开始/停止点击：启动前同步一次界面坐标；循环内每次取最新值
window.ui_start.on("click", () => {
  if (!clicking) {
    applyInputValues({ save: true });
    updateXYShow();
    clicking = true;
    paused = false;
    ui.run(() => {
      window.ui_record.setText("暂停");
      try { window.ui_record.setBackgroundColor(colors.parseColor("#607D8B")); } catch (e) {}
    });
    window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")");
    clickThread = threads.start(() => {
      var _lcx = null, _lcy = null;
      while (clicking) {
        if (!paused) {
          var cx = ax.get(), cy = ay.get();
          if (_lcx !== cx || _lcy !== cy) { 
            console.log("[click-loop] 使用坐标 (" + cx + "," + cy + ") 屏幕:" + device.width + "x" + device.height); 
            _lcx = cx; _lcy = cy; 
          }
          // 确保坐标合理才进行点击
          if (cx > 0 && cy > 0 && cx < device.width && cy < device.height) {
            if (!click(cx, cy)) press(cx, cy, 1);
          } else {
            console.log("[click-loop] 跳过无效坐标 (" + cx + "," + cy + ")");
          }
        }
        sleep(interval);
      }
    });
    setTimeout(() => { if (clicking) toggleDrawer(); }, 1500);
  } else {
    clicking = false;
    paused = false;
    if (clickThread) { clickThread.interrupt(); clickThread = null; }
    ui.run(() => {
      window.ui_record.setText("暂停");
      try { window.ui_record.setBackgroundColor(colors.parseColor("#607D8B")); } catch (e) {}
    });
    window.status.setText("已停止");
  }
});

// 7) 日志按钮
window.ui_log.on("click", () => {
  threads.start(() => {
    if (rzk) { console.hide(); rzk = 0; }
    else { console.show(true); rzk = 1; }
  });
});

// 8) 关闭
window.ui_close.on("click", () => {
  clicking = false;
  if (clickThread) { clickThread.interrupt(); clickThread = null; }
  window.close();
  exit();
});

// 暂停按钮：暂停/恢复点击
var paused = false;
window.ui_record.on("click", () => {
  if (!clicking) {
    toast("请先开始点击");
    return;
  }
  
  paused = !paused;
  ui.run(() => {
    if (paused) {
      window.ui_record.setText("继续");
      try { window.ui_record.setBackgroundColor(colors.parseColor("#FF9800")); } catch (e) {}
      window.status.setText("已暂停 (" + ax.get() + "," + ay.get() + ")");
    } else {
      window.ui_record.setText("暂停");
      try { window.ui_record.setBackgroundColor(colors.parseColor("#607D8B")); } catch (e) {}
      window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")");
    }
  });
  toast(paused ? "已暂停点击" : "继续点击");
});

// 保活
setInterval(() => {}, 1000);