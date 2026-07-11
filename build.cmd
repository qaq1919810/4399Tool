@echo off
:: 设置编码为 UTF-8，防止中文和特殊路径乱码
chcp 65001 >nul

echo ===================================================
echo               4399Plugin 自动化打包脚本
echo ===================================================

:: 1. 定义路径变量
set SRC_DIR=.\src
set KEY_PATH=.\secret\src.pem
set DIST_DIR=.\dist

:: 2. 检查必要的文件夹和密钥是否存在
if not exist %SRC_DIR% (
    echo [错误] 未找到 %SRC_DIR% 文件夹！
    goto END
)
if not exist %KEY_PATH% (
    echo [错误] 未在 \secret\ 目录下找到密钥文件 src.pem！
    goto END
)

:: 3. 自动从 manifest.json 中提取最新版本号 (利用 PowerShell 解析 JSON)
echo 正在读取扩展版本号...
for /f "delims=" %%i in ('powershell -Command "(Get-Content .\src\manifest.json | ConvertFrom-Json).version"') do (
    set VERSION=%%i
)

if "%VERSION%"=="" (
    echo [警告] 无法自动提取版本号，将使用默认名称。
    set OUTPUT_NAME=4399Plugin_latest.crx
) else (
    echo 成功检测到当前版本: v%VERSION%
    set OUTPUT_NAME=4399Plugin_v%VERSION%.crx
)

:: 4. 检查并创建输出目录，清理旧的残留文件
if not exist %DIST_DIR% mkdir %DIST_DIR%
if exist .\src.crx del /q .\src.crx

:: 5. 执行智能打包链（本地 -> 全局 -> 自动下载）
echo.
echo 正在通过 Bun 智能调用 crx 工具...

:: 这里使用 bun x（不加 --bun），完美激活“本地 > 全局 > 自动在线补齐”的特性
call bun x crx pack %SRC_DIR% -p %KEY_PATH% -o %DIST_DIR%\%OUTPUT_NAME%

:: 6. 检查最终打包结果
if exist %DIST_DIR%\%OUTPUT_NAME% (
    echo.
    echo ===================================================
    echo [成功] 打包完成！
    echo [输出] %DIST_DIR%\%OUTPUT_NAME%
    echo ===================================================
) else (
    echo [失败] 打包过程中似乎遇到了问题，请检查上方日志。
)

:END
echo.
pause