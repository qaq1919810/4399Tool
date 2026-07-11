@echo off
chcp 437 >nul

set REPO_URL=https://github.com/qaq1919810/4399Tool.git

if not exist .git (
    echo [INFO] No Git repository detected. Initializing and pulling here...
    :: 在当前目录初始化一个空的 Git 仓库
    git init
    :: 关联远程仓库地址
    git remote add origin %REPO_URL%
    :: 抓取并强行覆盖到本地
    git fetch --all
    git reset --hard origin/main 2>nul || git reset --hard origin/master
    goto END
)

echo [WARNING] A Git repository already exists in this directory.
echo [WARNING] Hard reset will DELETE all local changes and untracked files here!
set /p CONFIRM="Type 'yes' to confirm and continue: "

if "%CONFIRM%"=="yes" (
    echo [INFO] Confirmation received. Starting hard reset and update...

    echo [1/3] Fetching remote changes...
    git fetch --all

    echo [2/3] Hard resetting to remote...
    git reset --hard origin/main 2>nul || git reset --hard origin/master

    echo [3/3] Cleaning untracked files...
    git clean -fd

    echo [SUCCESS] Update complete! Current directory is now identical to remote.
) else (
    echo [CANCELLED] Reset cancelled. No changes were made.
)

:END
echo.
pause