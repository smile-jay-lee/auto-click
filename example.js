// 日志框是否显示
var rzk = 0
window = floaty.window(
    <horizontal gravity="center_vertical">
        <img id="floaty_icon" src="https://pic4.58cdn.com.cn/nowater/webim/big/n_v2c03cea6fbe3447978a999d5581ec6b69.jpg" w="50" h="50" alpha="1" radius="10" />
        <horizontal id="h_drawer">
            <vertical>
                <img padding="5 5 5 10" id="ui_tt" src="https://pic6.58cdn.com.cn/nowater/webim/big/n_v295958409863045678a469b12384ff3e1.png" w="45" h="45" alpha="1" radius="10" />
                <text text="" h="3" />
                <img padding="5 5 5 10" id="ui_cc" src="https://pic5.58cdn.com.cn/nowater/webim/big/n_v200ac1d3d06f5464d90b35657394c01ff.png" w="45" h="45" alpha="1" radius="10" />
            </vertical>
        </horizontal>
    </horizontal>
);
window.setPosition(50, device.height / 3);
window.h_drawer.visibility = 8;
var x = 0,
    y = 0;
var windowX, windowY;
window.floaty_icon.setOnTouchListener(function (view, event) {
    switch (event.getAction()) {
        case event.ACTION_DOWN:
            x = event.getRawX();
            y = event.getRawY();
            windowX = window.getX();
            windowY = window.getY();
            return true;
        case event.ACTION_MOVE:
            //移动手指时调整悬浮窗位置
            let movexx = windowX + (event.getRawX() - x);
            let moveyy = windowY + (event.getRawY() - y);
            if (movexx < 0 || movexx > device.width) {
                movexx = 0;
            }
            if (moveyy < 0 || moveyy > device.height) {
                moveyy = 0;
            }
            window.setPosition(movexx, moveyy);
            return true;
        case event.ACTION_UP:
            if (Math.abs(event.getRawY() - y) < 5 && Math.abs(event.getRawX() - x) < 5) {
                drawerStatus();
            }
            return true;
    }
    return true;
});
 
function drawerStatus() {
    if (window.h_drawer.visibility == 8) {
        window.h_drawer.visibility = 0;
    } else {
        window.h_drawer.visibility = 8;
    }
}
 
// 开始按钮监听
window.ui_tt.on('click', function () {
    // 开始运行
    if (isplay) {
        isplay = 0
        window.ui_tt.attr("src", "https://pic6.58cdn.com.cn/nowater/webim/big/n_v295958409863045678a469b12384ff3e1.png")
        toast("停止运行")
        nn.interrupt()
    } else {
        isplay = 1
        window.ui_tt.attr("src", "https://kefu.cckefu1.com/app/upload/temp/202401_p/09/09_1704776307954143cdbe409a5.png")
        toast("开始运行")
            //运行脚本
            //todo 在这里运行你的脚本
            nn =  threads.start(()=>{
                device.keepScreenOn()
                while(true){
                    log(666666)
                }
            })
        //两秒不点击暂停，则隐藏抽屉
        setTimeout(function () {
            if (isplay) {
                drawerStatus()
            }
        }, 2000)
 
        //监控运行还是暂停
        var monitoringStatus = setInterval(function () {
            if (!isplay) { //是运行说明暂停了
                nn.interrupt()
                clearInterval(monitoringStatus)
                drawerStatus()
            }
        }, 2000)
    }
});
 
// 日志按钮监听
window.ui_cc.on('click', function () {
    // 启动日志框
    threads.start(function () {
        // 判断日志狂
        if (rzk) {
            console.hide()
            rzk = 0
        } else {
            console.show(true)
            rzk = 1
        }
    })
})
 
setInterval(()=>{}, 1000);