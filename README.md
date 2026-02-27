C:\Users\Personal>ssh carapp@87.106.242.94
carapp@87.106.242.94's password:
Welcome to Ubuntu 24.04.4 LTS (GNU/Linux 6.8.0-100-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/pro

 System information as of Fri Feb 27 12:21:17 UTC 2026

  System load:  0.01              Processes:             109
  Usage of /:   41.9% of 8.65GB   Users logged in:       1
  Memory usage: 40%               IPv4 address for ens6: 87.106.242.94
  Swap usage:   0%

 * Strictly confined Kubernetes makes edge and IoT secure. Learn how MicroK8s
   just raised the bar for easy, resilient and secure K8s cluster deployment.

   https://ubuntu.com/engage/secure-kubernetes-at-the-edge

Expanded Security Maintenance for Applications is not enabled.

2 updates can be applied immediately.
To see these additional updates run: apt list --upgradable

1 additional security update can be applied with ESM Apps.
Learn more about enabling ESM Apps service at https://ubuntu.com/esm


*** System restart required ***
Last login: Fri Feb 27 12:08:16 2026 from 176.200.151.190
carapp@ubuntu:~$ sudo systemctl restart carbooking
[sudo] password for carapp:
carapp@ubuntu:~$ git pull origin main
fatal: not a git repository (or any of the parent directories): .git
carapp@ubuntu:~$ cd carbooking/
carapp@ubuntu:~/carbooking$ git pull origin main
remote: Enumerating objects: 21, done.
remote: Counting objects: 100% (21/21), done.
remote: Compressing objects: 100% (4/4), done.
remote: Total 12 (delta 7), reused 12 (delta 7), pack-reused 0 (from 0)
Unpacking objects: 100% (12/12), 3.02 KiB | 343.00 KiB/s, done.
From https://github.com/giammarcoPiccoliExt/v2
 * branch            main       -> FETCH_HEAD
   22032ea..92dc83f  main       -> origin/main
Updating 22032ea..92dc83f
Fast-forward
 public/css/main.css        |  9 ++++++---
 public/js/app.js           |  9 +++++++++
 public/js/bookings.js      | 12 ++++++++----
 public/js/notifications.js | 28 ++++++++++++++++++++++++++++
 public/js/summary.js       | 26 ++++++++++++++++++++++++++
 server/index.js            | 16 +++++++++++++---
 6 files changed, 90 insertions(+), 10 deletions(-)
 create mode 100644 public/js/notifications.js
 create mode 100644 public/js/summary.js
carapp@ubuntu:~/carbooking$ sudo systemctl restart carbooking
carapp@ubuntu:~/carbooking$