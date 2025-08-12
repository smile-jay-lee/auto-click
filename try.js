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

// 共享坐标（线程安全）
const AtomicInteger = java.util.concurrent.atomic.AtomicInteger;
var ax = new AtomicInteger(x);
var ay = new AtomicInteger(y);
var interval = 500;

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
      // 同步普通变量，防止遗留代码读取旧值
      x = xy.x;
      y = xy.y;
    }
  } catch (e) {}
  updateXYShow();
}

function setWindowTouchable(t) { try { window.setTouchable(t); } catch (e) {} }

// 3) 悬浮窗
var window = floaty.window(
  <frame>
    <vertical bg="#263238" alpha="0.96" padding="10" w="300">
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
                <text id="valX" text="500" w="0" layout_weight="1" gravity="center" textColor="#FFFFFF" textSize="13sp" bg="#455A64" padding="4 3" margin="6 0 0 6"/>
              </horizontal>
              <horizontal w="8"/>
              <horizontal w="0" layout_weight="1" gravity="center_vertical">
                <text text="Y" textColor="#B0BEC5" textSize="12sp"/>
                <text id="valY" text="1000" w="0" layout_weight="1" gravity="center" textColor="#FFFFFF" textSize="13sp" bg="#455A64" padding="4 3" margin="6 0 0 6"/>
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
              <button id="ui_close" text="关闭" w="0" layout_weight="1" h="42" textSize="13sp" bg="#F44336" textColor="#FFFFFF" margin="0 4 0 0"/>
              <button id="ui_record" text="记录" w="0" layout_weight="1" h="42" textSize="13sp" bg="#607D8B" textColor="#FFFFFF" margin="0 4 0 0"/>
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
  if (!window || !window.valX) return; // 防止窗口未初始化时报错
  ui.run(() => {
    var cx = ax.get(), cy = ay.get();
    window.xyShow.setText("坐标: (" + cx + ", " + cy + ")");
    window.valX.setText(String(cx));
    window.valY.setText(String(cy));
  });
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

// 使用弹窗输入（支持 rawInput 或 dialogs.input），把结果写回 ax/ay
function evalInt(str, defVal) {
  if (str == null) return defVal;
  str = String(str).trim();
  if (str === "") return defVal;
  // 允许简单算式 1+2*3
  if (/^[\d+\-*/().\s]+$/.test(str)) {
    try {
      var v = Math.round(Number(eval(str)));
      return isFinite(v) ? v : defVal;
    } catch (e) { return defVal; }
  }
  var n = parseInt(str, 10);
  return isNaN(n) ? defVal : n;
}

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

function setCoord(nx, ny, opts) {
  var changed = false;
  if (typeof nx === "number" && nx !== ax.get()) { ax.set(nx); x = nx; changed = true; }
  if (typeof ny === "number" && ny !== ay.get()) { ay.set(ny); y = ny; changed = true; }
  if (changed) updateXYShow();
  if (opts && opts.save) saveState();
  if (changed) console.log("[coord] -> (" + ax.get() + "," + ay.get() + ")");
}

function editX() {
  var cur = ax.get();
  var input = (typeof rawInput === "function")
    ? rawInput("请输入X坐标", String(cur))
    : dialogs.input("请输入X坐标", String(cur));
  var v = evalInt(input, cur);
  setCoord(v, ay.get(), { save: true });   // 统一入口
  if (clicking) ui.run(() => window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")"));
}

function editY() {
  var cur = ay.get();
  var input = (typeof rawInput === "function")
    ? rawInput("请输入Y坐标", String(cur))
    : dialogs.input("请输入Y坐标", String(cur));
  var v = evalInt(input, cur);
  setCoord(ax.get(), v, { save: true });
  if (clicking) ui.run(() => window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")"));
}

// 绑定事件：点数字弹窗输入；长按整行同时输入X/Y
window.valX.on("click", editX);
window.valY.on("click", editY);

// 选择位置：等待下一次触屏获取坐标
window.ui_select.on("click", () => {
  startSelectMode();
});

// 全局触控监听，只在 selecting=true 时记录一次 (扩展：recording 模式下持续记录)
events.observeTouch();
events.on("touch", function (p) {
  // 记录模式：捕获所有触摸
  if (recording) {
    var xyR = getTouchXY(p);
    touchRecords.push({ x: xyR[0], y: xyR[1], time: new Date().toLocaleTimeString() });
    if (touchRecords.length > 300) touchRecords.shift();
    console.log("[touch] (" + xyR[0] + "," + xyR[1] + ")  总数=" + touchRecords.length);
    ui.run(() => { try { if (window.preview) window.preview.setText("Last: (" + xyR[0] + "," + xyR[1] + ") 记录=" + touchRecords.length); } catch (e) {} });
  }
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
      setCoord(rx, ry, { save: true });
      try {
        history.push({ x: rx, y: ry, time: new Date().toLocaleString() });
        if (history.length > 30) history.shift();
        saveState();
      } catch (e) {}
      if (clicking) ui.run(() => window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")"));
      toast("已记录坐标: (" + rx + ", " + ry + ")");
    } else {
      toast("已取消");
    }
  });
});

// 历史记录选择
window.ui_history && window.ui_history.on("click", () => {
  if (!history.length) { toast("暂无历史记录"); return; }
  var items = history.map((h, i) => "#" + (i + 1) + "  (" + h.x + ", " + h.y + ")  " + (h.time || ""));
  var idx = dialogs.select("选择历史坐标", items);
  if (idx >= 0) {
    var rec = history[idx];
    ax.set(rec.x);
    ay.set(rec.y);
    updateXYShow();
    saveState();
    if (clicking) ui.run(() => window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")"));
    toast("已应用: (" + rec.x + ", " + rec.y + ")");
  }
});

// 6) 开始/停止点击：启动前同步一次界面坐标；循环内每次取最新值
window.ui_start.on("click", () => {
  if (!clicking) {
    // 开始前确保使用最新输入
    updateXYShow();
    clicking = true;
    window.status.setText("点击中… (" + ax.get() + "," + ay.get() + ")");
    clickThread = threads.start(() => {
      while (clicking) {
        var cx = ax.get(), cy = ay.get();   // 始终读取最新坐标
        if (!click(cx, cy)) press(cx, cy, 1);
        sleep(interval);
      }
    });
    setTimeout(() => { if (clicking) toggleDrawer(); }, 1500);
  } else {
    clicking = false;
    if (clickThread) { clickThread.interrupt(); clickThread = null; }
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

// 记录按钮：开始/停止记录触摸点
window.ui_record.on("click", () => {
  if (!recording) {
    recording = true;
    ui.run(() => {
      window.ui_record.setText("录中");
      try { window.ui_record.setBackgroundColor(colors.parseColor("#FF9800")); } catch (e) {}
    });
    toast("开始记录触摸点");
  } else {
    recording = false;
    ui.run(() => {
      window.ui_record.setText("记录");
      try { window.ui_record.setBackgroundColor(colors.parseColor("#607D8B")); } catch (e) {}
    });
    toast("停止记录，共 " + touchRecords.length + " 点");
    if (touchRecords.length) {
      threads.start(() => {
        try {
          var items = touchRecords.map((r, i) => (i + 1) + ") (" + r.x + "," + r.y + ") " + r.time);
          var idx = dialogs.select("触摸记录 (点选复制)", items);
            if (idx >= 0) {
              setClip(touchRecords[idx].x + "," + touchRecords[idx].y);
              toast("已复制: " + touchRecords[idx].x + "," + touchRecords[idx].y);
            }
        } catch (e) {}
      });
    }
  }
});

// 长按记录按钮：操作菜单（查看/复制全部/清空）
try {
  window.ui_record.setOnLongClickListener(function(v){
    if (!touchRecords.length) { toast("暂无记录"); return true; }
    threads.start(() => {
      try {
        var act = dialogs.select("记录操作", ["查看列表", "复制全部", "清空"]);
        if (act == 0) {
          var lines = touchRecords.map((r,i)=> (i+1)+": ("+r.x+","+r.y+") "+r.time).join("\n");
          dialogs.alert("触摸列表", lines);
        } else if (act == 1) {
          setClip(touchRecords.map(r=> r.x+","+r.y).join(";"));
          toast("已复制全部");
        } else if (act == 2) {
          touchRecords = [];
          toast("已清空");
          ui.run(()=>{ try { if (window.preview) window.preview.setText(""); } catch(e){} });
        }
      } catch (e) {}
    });
    return true;
  });
} catch (e) {}

// 保活
setInterval(() => {}, 1000);