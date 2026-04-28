[1mdiff --git a/dgx_photobooth/tunnel.log b/dgx_photobooth/tunnel.log[m
[1mdeleted file mode 100644[m
[1mindex 11c29eb..0000000[m
[1m--- a/dgx_photobooth/tunnel.log[m
[1m+++ /dev/null[m
[36m@@ -1,23 +0,0 @@[m
[31m-2026-04-13T05:59:37Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use (https://www.cloudflare.com/website-terms/), and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps[m
[31m-2026-04-13T05:59:37Z INF Requesting new quick Tunnel on trycloudflare.com...[m
[31m-2026-04-13T05:59:41Z INF +--------------------------------------------------------------------------------------------+[m
[31m-2026-04-13T05:59:41Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |[m
[31m-2026-04-13T05:59:41Z INF |  https://libs-normal-followed-tab.trycloudflare.com                                        |[m
[31m-2026-04-13T05:59:41Z INF +--------------------------------------------------------------------------------------------+[m
[31m-2026-04-13T05:59:41Z INF Cannot determine default configuration path. No file [config.yml config.yaml] in [~/.cloudflared ~/.cloudflare-warp ~/cloudflare-warp /etc/cloudflared /usr/local/etc/cloudflared][m
[31m-2026-04-13T05:59:41Z INF Version 2026.2.0-7-gc0bc3bdb (Checksum 72a25e3caf146ac3243789218ac56133ee8c0b30cc8a5d35dbd9cc9472fa60be)[m
[31m-2026-04-13T05:59:41Z INF GOOS: linux, GOVersion: go1.24.13, GoArch: arm64[m
[31m-2026-04-13T05:59:41Z INF Settings: map[ha-connections:1 protocol:quic url:http://localhost:5001][m
[31m-2026-04-13T05:59:41Z INF cloudflared will not automatically update if installed by a package manager.[m
[31m-2026-04-13T05:59:41Z INF Generated Connector ID: bb78c223-667c-43b6-89eb-9a58d9249e15[m
[31m-2026-04-13T05:59:41Z INF Initial protocol quic[m
[31m-2026-04-13T05:59:41Z INF ICMP proxy will use 172.20.162.170 as source for IPv4[m
[31m-2026-04-13T05:59:41Z INF ICMP proxy will use fe80::2f7b:4bda:8894:df52 in zone wlP9s9 as source for IPv6[m
[31m-2026-04-13T05:59:41Z WRN The user running cloudflared process has a GID (group ID) that is not within ping_group_range. You might need to add that user to a group within that range, or instead update the range to encompass a group the user is already in by modifying /proc/sys/net/ipv4/ping_group_range. Otherwise cloudflared will not be able to ping this network error="Group ID 1000 is not between ping group 1 to 0"[m
[31m-2026-04-13T05:59:41Z WRN ICMP proxy feature is disabled error="cannot create ICMPv4 proxy: Group ID 1000 is not between ping group 1 to 0 nor ICMPv6 proxy: socket: permission denied"[m
[31m-2026-04-13T05:59:41Z INF ICMP proxy will use 172.20.162.170 as source for IPv4[m
[31m-2026-04-13T05:59:41Z INF ICMP proxy will use fe80::2f7b:4bda:8894:df52 in zone wlP9s9 as source for IPv6[m
[31m-2026-04-13T05:59:41Z INF Starting metrics server on 127.0.0.1:20241/metrics[m
[31m-2026-04-13T05:59:41Z INF Tunnel connection curve preferences: [X25519MLKEM768 CurveP256] connIndex=0 event=0 ip=198.41.192.57[m
[31m-2026/04/13 13:59:41 failed to sufficiently increase receive buffer size (was: 208 kiB, wanted: 7168 kiB, got: 416 kiB). See https://github.com/quic-go/quic-go/wiki/UDP-Buffer-Sizes for details.[m
[31m-2026-04-13T05:59:42Z INF Registered tunnel connection connIndex=0 connection=e883f609-80ae-4a92-b0cc-e54856a0f280 event=0 ip=198.41.192.57 location=sin17 protocol=quic[m
[1mdiff --git a/start_system.sh b/start_system.sh[m
[1mindex 0ca458f..e964599 100755[m
[1m--- a/start_system.sh[m
[1m+++ b/start_system.sh[m
[36m@@ -1,33 +1,21 @@[m
 #!/bin/bash[m
[31m-[m
[31m-# Configuration[m
[31m-COMFY_DIR="/home/ai-cc/Documents/projects/ComfyUI"[m
[31m-PROJECT_DIR="/home/ai-cc/Documents/projects/CNY_photobooth"[m
[31m-CLOUDFLARE_URL="http://localhost:5001"[m
[32m+[m[32mSESSION="photobooth"[m
 CONDA_PROFILE="/home/ai-cc/miniconda3/etc/profile.d/conda.sh"[m
[31m-TUNNEL_LOG="$PROJECT_DIR/tunnel.log"[m
[31m-[m
[31m-export DEPLOY_MODE=remote[m
 [m
[31m-echo "=========================================="[m
[31m-echo "  DEPLOY MODE: REMOTE (dual-machine)"[m
[31m-echo "  Linux receiver + video generation"[m
[31m-echo "=========================================="[m
[31m-echo ""[m
[31m-echo "Starting CNY Photobooth System..."[m
[32m+[m[32m# Kill existing session if it exists[m
[32m+[m[32mtmux kill-session -t $SESSION 2>/dev/null[m
 [m
[31m-# 1. Start ComfyUI Server[m
[31m-echo "Starting ComfyUI..."[m
[31m-gnome-terminal --title="ComfyUI Server" -- bash -c "export DEPLOY_MODE=remote; source '$CONDA_PROFILE'; conda activate comfyui; cd '$COMFY_DIR'; python main.py --enable-manager; exec bash"[m
[32m+[m[32m# Start Session and Window 1 (ComfyUI)[m
[32m+[m[32mtmux new-session -d -s $SESSION -n "ComfyUI"[m
[32m+[m[32mtmux send-keys -t $SESSION:0 "source $CONDA_PROFILE && conda activate comfyui && cd /home/ai-cc/Documents/projects/ComfyUI && python main.py --enable-manager" C-m[m
 [m
[31m-# 2. Start Linux Receiver (Flask App)[m
[31m-echo "Starting Linux Receiver..."[m
[31m-gnome-terminal --title="Linux Receiver" -- bash -c "export DEPLOY_MODE=remote; source '$CONDA_PROFILE'; conda activate comfyui; cd '$PROJECT_DIR/dgx_photobooth'; python linux_receiver.py; exec bash"[m
[32m+[m[32m# Window 2 (Receiver)[m
[32m+[m[32mtmux new-window -t $SESSION -n "Receiver"[m
[32m+[m[32mtmux send-keys -t $SESSION:1 "source $CONDA_PROFILE && conda activate comfyui && cd /home/ai-cc/Documents/projects/CNY_photobooth/dgx_photobooth && python linux_receiver.py" C-m[m
 [m
[31m-# 3. Start Cloudflare Tunnel[m
[31m-echo "Starting Cloudflare Tunnel..."[m
[31m-rm -f "$PROJECT_DIR/dgx_photobooth/tunnel.log"[m
[31m-gnome-terminal --title="Cloudflare Tunnel" -- bash -c "cd '$PROJECT_DIR/dgx_photobooth' && cloudflared tunnel --url $CLOUDFLARE_URL 2>&1 | tee tunnel.log; exec bash"[m
[32m+[m[32m# Window 3 (Tunnel)[m
[32m+[m[32mtmux new-window -t $SESSION -n "Tunnel"[m
[32m+[m[32mtmux send-keys -t $SESSION:2 "cd /home/ai-cc/Documents/projects/CNY_photobooth/dgx_photobooth && cloudflared tunnel --url http://localhost:5001" C-m[m
 [m
[31m-echo "All systems initiated in REMOTE mode."[m
[31m-echo "Tunnel log: $TUNNEL_LOG"[m
[32m+[m[32m# Attach to the session so you can see it[m
[32m+[m[32mtmux attach-session -t $SESSION[m
