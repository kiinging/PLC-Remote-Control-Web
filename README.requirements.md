about a year ago, i was intented to create a PLC remote lab for temperature control based omron nj301 plc, an SBC act as a getway to communicate between the web browser and the PLC. the SBC also sample temperature data from the MA31865 RDT sensor. The communication between the PLC and the SBC is done in modbus TCP protocol. The webpage is hosted in cloudflare. I bought a cheap domain namely, https://plc-web.online. I think i hv tested all the low level staffs (I can say 80 percent completed). These include the modbus communication, the PLC code using the PID to regulate the temperature, and the heater coil heat up and the temperature is also read. I think i want to start improve my web page. at the moment it is not REACT. It is just html, css and script.js. It is just a simple control dashboard to control the PLC with login and logout. I want to include features for my students so that they can create account, login, and etc like a professional remote lab web site. I think i want to use Cursor (then verified using ChatGPT Plus). in the pass I just used ChatGPT. I also want to check with u if the cloudflare is a good place to host the webpage. i also see a youtube using Vercel. Plz guide me what should i do using Cursor. I hv no experience of using Cursor. I hv been using rovodev for 3 days. i found it is almost free: the free tokens are a lot and it hardly finish. even if it finish i can login using a different gmail account. What about Cursor? i was stopping my remote lab last time because i found it is very hard for me to just use ChatGPT to run the project.


Browser → Cloud API (Worker) → SBC gateway → PLC

Must-have features

Account system

Student signup (or teacher creates accounts)

Login/logout

Password reset (optional early)

Session control

Only one student controls the rig at a time (or a queue system)

Time slot / timer (e.g., 10–20 minutes per student)

Audit + safety

Log who changed setpoint, when

Limits: max setpoint, ramp rate, emergency stop

Live data

Temperature chart, setpoint, output (MV), status bits

WebSocket or polling (polling is fine to start)