"strict mode";

// 1) 申请悬浮窗权限
if (!floaty.checkPermission()) {
    floaty.requestPermission();
    while (!floaty.checkPermission()) sleep(300);
}
try { auto.waitFor(); } catch (e) {}

// 2) 使用简单变量存储坐标（避免复杂同步问题）
var currentX = 500;
var currentY = 1000;
var clicking = false;
var clickThread = null;
var rzk = 0;
var selecting = false;
var history = [];
var storage = storages.create("auto_clicker");
var interval = 500;

// 3) 保存/加载状态
function saveState() {
    try {
        storage.put("history", history);
        storage.put("xy", { x: currentX, y: currentY });
        console.log("状态已保存: (" + currentX + "," + currentY + ")");
    } catch (e) {
        console.error("保存失败: " + e);
    }
}

function loadState() {
    try {
        var h = storage.get("history", []);
        if (Array.isArray(h)) history = h;
        
        var xy = storage.get("xy");
        if (xy && typeof xy.x === "number" && typeof xy.y === "number") {
            currentX = xy.x;
            currentY = xy.y;
        }
        console.log("状态已加载: (" + currentX + "," + currentY + ")");
    } catch (e) {
        console.error("加载失败: " + e);
    }
}

// 4) 创建悬浮窗
var window = floaty.window(
    <frame>
        <vertical bg="#263238" alpha="0.96" padding="10" w="300" >
            <horizontal gravity="center_vertical" >
                <img id="floaty_icon"
                     src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                     bg="#4CAF50" w="48" h="48" radius="24" margin="0 12 0 0"/>
                <vertical id="h_drawer" visibility="gone" w="0" layout_weight="1">
                    <text text="自动点击器" textColor="#FFFFFF" textSize="17sp" gravity="center" margin="0 0 6 0"/>

                    <vertical bg="#37474F" padding="8" radius="6" >
                        <horizontal gravity="center_vertical" >
                            <horizontal w="0" layout_weight="1" gravity="center_vertical" >
                                <text text="X" textColor="#B0BEC5" textSize="12sp"/>
                                <input id="valX" w="0" layout_weight="1" singleLine="true"
                                       textColor="#FFFFFF" textSize="13sp" gravity="center"
                                       bg="#455A64" padding="4 3" margin="6 0 0 6" inputType="number" />
                            </horizontal>
                            <horizontal w="8"/>
                            <horizontal w="0" layout_weight="1" gravity="center_vertical" >
                                <text text="Y" textColor="#B0BEC5" textSize="12sp"/>
                                <input id="valY" w="0" layout_weight="1" singleLine="true"
                                       textColor="#FFFFFF" textSize="13sp" gravity="center"
                                       bg="#455A64" padding="4 3" margin="6 0 0 6" inputType="number" />
                            </horizontal>
                        </horizontal>
                        <text id="xyShow" text="当前坐标: (500, 1000)" textColor="#ECEFF1"
                              textSize="11sp" gravity="center" margin="6 0 0 0"/>
                    </vertical>

                    <text id="preview" text="" textColor="#FFB74D" textSize="11sp" gravity="center" margin="6 0 0 0"/>

                    <horizontal h="1" bg="#37474F" margin="8 0 8 0"/>

                    <vertical id="btn_panel" bg="#37474F" padding="6" radius="6" margin="0 0 0 0">
                        <horizontal>
                            <button id="ui_start"   text="开始"  w="0" layout_weight="1" h="42" textSize="13sp" bg="#4CAF50"  textColor="#FFFFFF" margin="0 4 0 0"/>
                            <button id="ui_select"  text="选点"  w="0" layout_weight="1" h="42" textSize="13sp" bg="#FFC107" textColor="#263238" margin="0 4 0 0"/>
                            <button id="ui_history" text="历史"  w="0" layout_weight="1" h="42" textSize="13sp" bg="#9C27B0" textColor="#FFFFFF"/>
                        </horizontal>
                        <horizontal margin="6 0 0 0">
                            <button id="ui_log"    text="日志"  w="0" layout_weight="1" h="42" textSize="13sp" bg="#2196F3" textColor="#FFFFFF" margin="0 4 0 0"/>
                            <button id="ui_close"  text="关闭"  w="0" layout_weight="1" h="42" textSize="13sp" bg="#F44336" textColor="#FFFFFF" margin="0 4 0 0"/>
                            <button id="btn_placeholder" text="" w="0" layout_weight="1" h="42" bg="#37474F" alpha="0" enabled="false" />
                        </horizontal>
                    </vertical>

                    <text id="status" text="未开始" textColor="#FFFFFF" textSize="12sp" gravity="center"
                          bg="#455A64" padding="6" margin="10 0 0 0" radius="4"/>
                </vertical>
            </horizontal>
        </vertical>
    </frame>
);

// 5) 初始设置
window.setPosition(50, device.height / 3);
loadState();
updateUI();

// 6) 工具函数
function updateUI() {
    ui.run(() => {
        window.xyShow.setText("当前坐标: (" + currentX + ", " + currentY + ")");
        window.valX.setText(String(currentX));
        window.valY.setText(String(currentY));
        window.status.setText(clicking ? "点击中..." : "已停止");
    });
}

function setPosition(x, y) {
    currentX = x;
    currentY = y;
    saveState();
    updateUI();
    console.log("坐标已更新: (" + x + ", " + y + ")");
}

function toggleDrawer() {
    ui.run(() => {
        if (window.h_drawer.visibility === 8) {
            window.h_drawer.visibility = 0;
        } else {
            window.h_drawer.visibility = 8;
        }
    });
}

// 7) 输入框处理
window.valX.on("touch_down", () => {
    window.valX.requestFocus();
});

window.valX.on("key", (keyCode, event) => {
    if (keyCode === keys.enter) {
        var newX = parseInt(window.valX.getText().toString()) || currentX;
        setPosition(newX, currentY);
        return true;
    }
    return false;
});

window.valY.on("touch_down", () => {
    window.valY.requestFocus();
});

window.valY.on("key", (keyCode, event) => {
    if (keyCode === keys.enter) {
        var newY = parseInt(window.valY.getText().toString()) || currentY;
        setPosition(currentX, newY);
        return true;
    }
    return false;
});

// 8) 图标拖拽
window.floaty_icon.setOnTouchListener(function (view, event) {
    switch (event.getAction()) {
        case event.ACTION_DOWN:
            lastX = event.getRawX();
            lastY = event.getRawY();
            windowX = window.getX();
            windowY = window.getY();
            return true;
        case event.ACTION_MOVE:
            let moveX = windowX + (event.getRawX() - lastX);
            let moveY = windowY + (event.getRawY() - lastY);
            moveX = Math.max(0, Math.min(moveX, device.width - 100));
            moveY = Math.max(0, Math.min(moveY, device.height - 100));
            window.setPosition(moveX, moveY);
            return true;
        case event.ACTION_UP:
            if (Math.abs(event.getRawY() - lastY) < 10) {
                toggleDrawer();
            }
            return true;
    }
    return true;
});

// 9) 按钮事件
window.ui_start.click(() => {
    if (!clicking) {
        // 确保使用当前输入框的值
        var newX = parseInt(window.valX.getText().toString()) || currentX;
        var newY = parseInt(window.valY.getText().toString()) || currentY;
        setPosition(newX, newY);
        
        clicking = true;
        updateUI();
        
        clickThread = threads.start(function () {
            while (clicking) {
                console.log("点击位置: (" + currentX + ", " + currentY + ")");
                
                // 使用多种点击方法确保可靠性
                try {
                    click(currentX, currentY);
                } catch (e1) {
                    try {
                        press(currentX, currentY, 50);
                    } catch (e2) {
                        console.error("点击失败: " + e2);
                    }
                }
                
                sleep(interval);
            }
        });
    } else {
        clicking = false;
        if (clickThread) {
            clickThread.interrupt();
        }
        updateUI();
    }
});

window.ui_select.click(() => {
    toast("请点击屏幕上的目标位置");
    selecting = true;
    ui.run(() => {
        window.preview.setText("等待选择坐标...");
        window.setTouchable(false);
    });
    
    events.observeTouch();
    events.once("touch", function (p) {
        if (!selecting) return;
        
        var rx = p.getX();
        var ry = p.getY();
        
        ui.run(() => {
            window.preview.setText("已选择: (" + rx + ", " + ry + ")");
        });
        
        setTimeout(() => {
            selecting = false;
            ui.run(() => {
                window.preview.setText("");
                window.setTouchable(true);
            });
            
            setPosition(rx, ry);
            toast("坐标已设置: (" + rx + ", " + ry + ")");
            
            // 添加到历史记录
            history.push({
                x: rx,
                y: ry,
                time: new Date().toLocaleTimeString()
            });
            if (history.length > 20) history.shift();
            saveState();
        }, 1000);
    });
});

window.ui_history.click(() => {
    if (history.length === 0) {
        toast("没有历史记录");
        return;
    }
    
    var items = history.map((item, index) => {
        return `#${index + 1} (${item.x}, ${item.y}) ${item.time}`;
    });
    
    dialogs.select("选择历史坐标", items.concat(["清除记录"]))
        .then(index => {
            if (index < 0) return;
            
            if (index === items.length) {
                // 清除记录
                history = [];
                saveState();
                toast("历史记录已清除");
            } else {
                var coord = history[index];
                setPosition(coord.x, coord.y);
                toast("已应用坐标");
            }
        });
});

window.ui_log.click(() => {
    if (rzk) {
        console.hide();
        rzk = 0;
    } else {
        console.show();
        rzk = 1;
    }
});

window.ui_close.click(() => {
    clicking = false;
    if (clickThread) {
        clickThread.interrupt();
    }
    window.close();
    exit();
});

// 10) 初始化完成
toast("自动点击器已启动");
setInterval(() => {}, 1000);