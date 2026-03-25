// ===============================
// INITIALIZATION
// ===============================
const supabaseUrl = 'https://kqcybjsmiipfrragpxea.supabase.co';
const supabaseKey = 'sb_publishable_jAo_Zs34PhOan4grwG1e9g_zACXIv3B';

let db;
let supabaseClient;

try {
    if (typeof supabase !== 'undefined') {
        // Ek hi client banakar dono variables ko assign karein
        const client = supabase.createClient(supabaseUrl, supabaseKey);
        db = client;
        supabaseClient = client; 
        
        console.log("Supabase initialized successfully!");
    } else {
        console.error("Supabase library not found! Check your HTML script tags.");
    }
} catch (e) {
    console.error("Initialization error:", e);
}

// Global State
let currentUser = null;
let currentOTP = null;
let tempRegisterData = {};
let activeCourseId = null;
let currentCaptchaAnswer = 0;
let pendingCourseFiles = [];
let modalPromiseResolve = null;


// Expose to Window
window.toggleSidebar = toggleSidebar; window.navigate = navigate; window.logout = logout;
window.handleLogin = handleLogin; window.payWithRazorpay = payWithRazorpay;
window.saveProfileSettings = saveProfileSettings; window.deleteUserAccount = deleteUserAccount;
window.closeDocumentReader = closeDocumentReader; window.createCourse = createCourse;
window.togglePriceInput = togglePriceInput; window.previewFiles = previewFiles;
window.addFilesToDraft = addFilesToDraft; window.openCoursePlayer = openCoursePlayer;
window.toggleEditMode = () => {
    const isEditMode = document.getElementById('editModeToggle').checked;
    const adminToolbar = document.getElementById('adminToolbar');

    if (isEditMode) {
        adminToolbar.classList.remove('hidden');
    } else {
        adminToolbar.classList.add('hidden');
    }

    // 🔥 IMPORTANT: re-render files
    openCoursePlayer(activeCourseId);
};
window.deleteSpecificFile = async (index) => {
    const confirm = await showPremiumModal("Confirm", "Delete this file from course?", "confirm");
    if (!confirm) return;

    try {
        const { data: course } = await db
            .from('courses')
            .select('files')
            .eq('id', activeCourseId)
            .single();

        let currentFiles = course.files || [];
        const fileToDelete = currentFiles[index];

        // 🔥 STORAGE DELETE
        if (fileToDelete?.url) {
            const path = fileToDelete.url.split('/course_materials/')[1];

            if (path) {
                await supabaseClient.storage
                    .from('course_materials')
                    .remove([path]);
            }
        }

        // 🔥 DB UPDATE
        currentFiles.splice(index, 1);

        await db.from('courses')
            .update({ files: currentFiles })
            .eq('id', activeCourseId);

        await openCoursePlayer(activeCourseId);

        showPremiumModal("Deleted", "File removed completely.", "alert");

    } catch (e) {
        console.error(e);
        showPremiumModal("Error", "Could not delete file.", "alert");
    }
};
window.adminAddFiles = async () => {
    const fileInput = document.getElementById('addFileInput');
    if (!fileInput.files.length) return;

    showPremiumModal("Uploading", "Adding new files to course...", "progress");
    
    try {
        // 1. Fetch current course data
        const { data: course } = await db.from('courses').select('files').eq('id', activeCourseId).single();
        let currentFiles = course.files || [];

        for (let file of fileInput.files) {
            const path = `public/${Date.now()}_${file.name}`;
            const { data, error } = await supabaseClient.storage.from('course_materials').upload(path, file);
            if (error) throw error;

            const url = supabaseClient.storage.from('course_materials').getPublicUrl(data.path).data.publicUrl;
            currentFiles.push({ name: file.name, type: file.type, url: url });
        }

        // 2. Update Database
        await db.from('courses').update({ files: currentFiles }).eq('id', activeCourseId);
        
        closePremiumModal();
        await openCoursePlayer(activeCourseId); // Refresh player
        showPremiumModal("Success", "Files added successfully!", "alert");
    } catch (e) {
        closePremiumModal();
        showPremiumModal("Error", e.message, "alert");
    }
};
window.adminChangeBanner = async () => {
    const input = document.getElementById("bannerInput"); // HTML me input banana padega
    if (!input.files.length) return;

    const file = input.files[0];

    showPremiumModal("Uploading...", "Updating course banner...", "progress");

    try {
        // Upload new banner
        const path = `public/banner_${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient
            .storage
            .from('thumbnails')
            .upload(path, file);

        if (error) throw error;

        const url = supabaseClient
            .storage
            .from('thumbnails')
            .getPublicUrl(data.path).data.publicUrl;

        // Update course thumb (banner)
        await db.from('courses')
            .update({ thumb: url })
            .eq('id', activeCourseId);

        closePremiumModal();
        openCoursePlayer(activeCourseId);

        showPremiumModal("Success", "Banner updated!", "alert");

    } catch (e) {
        closePremiumModal();
        showPremiumModal("Error", "Banner update failed.", "alert");
    }
};
window.deleteCurrentCourse = async () => {
    const confirm = await showPremiumModal("Confirm", "Do you want to delete this ENTIRE course?", "confirm");
    if (!confirm) return;

    try {
        showPremiumModal("Deleting...", "Removing course...", "progress");
        // Remove the Number() wrapper if your Supabase ID is a string (UUID)
        await db.from('courses').delete().eq('id', activeCourseId);
        
        await renderManageCourses(); 
        navigate('dashboard'); // Return to dash after deletion
        closePremiumModal();
    } catch (e) {
        showPremiumModal("Error", "Failed to delete.", "alert");
    }
};
window.closePremiumModal = closePremiumModal; window.buyCourse = buyCourse;
window.renderUserDashboard = renderUserDashboard; window.renderEarnings = renderEarnings;
window.updateAdminEarningsWidget = updateAdminEarningsWidget;
window.verifyCaptchaAndSendOTP = verifyCaptchaAndSendOTP;
window.verifyOTPAndProceed = verifyOTPAndProceed; window.removeDraftFile = removeDraftFile;
window.openFile = async (url, type, name) => {
    const media = document.getElementById('mainMediaContainer');
    const playerView = document.getElementById('coursePlayerView');
    const readerView = document.getElementById('documentReaderView');

    // Reset views
    media.innerHTML = ""; 

    if (type.includes("video")) {
        // Video Auto-play fix
        media.innerHTML = `
            <video id="activeVideo" controls autoplay controlsList="nodownload" 
           oncontextmenu="return false;" style="width:100%;height:100%;">
                <source src="${url}" type="${type}">
                Your browser does not support the video tag.
            </video>`;
        
        // Force play logic
        const video = document.getElementById('activeVideo');
        video.play().catch(err => console.log("Autoplay blocked, needs user click"));
    } 
    else if (type.includes("pdf")) {
        // PDF Open logic
        playerView.classList.add('hidden'); // Player chhupao
        readerView.classList.remove('hidden'); // Reader dikhao
        document.getElementById('readerDocTitle').innerText = name;

        const container = document.getElementById('pdfRenderer');
        container.innerHTML = "<p style='color:#333; padding:20px;'>Loading Document...</p>";

        try {
            // pdfjsLib use karke render
            const loadingTask = pdfjsLib.getDocument(url);
            const pdf = await loadingTask.promise;
            container.innerHTML = ""; // Clear loader

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.style.display = "block";
                canvas.style.margin = "10px auto";
                canvas.style.maxWidth = "100%";
                container.appendChild(canvas);

                await page.render({ canvasContext: context, viewport: viewport }).promise;
            }
        } catch (e) {
            console.error("PDF Error:", e);
            container.innerHTML = "<p style='color:red;'>Failed to load PDF. Check Supabase CORS settings.</p>";
        }
    }
};

//=======================
// Auto-Login
//=======================
document.addEventListener("DOMContentLoaded", () => {
    const savedUser = localStorage.getItem('activeUser');
    if (savedUser && savedUser !== "undefined") {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('authScreen').classList.add('hidden');
            loadDashboard();
            navigate(localStorage.getItem('lastPage') || 'dashboard');
        } catch (e) { logout(); }
    } else {
        document.getElementById('publicMenu').classList.remove('hidden');
        navigate('auth');
    }
});

// ===============================
// AUTHENTICATION
// ===============================
async function handleLogin() {
    const input = document.getElementById('lUser').value.trim().toLowerCase();
    const pass = document.getElementById('lPass').value.trim();

    if (!input || !pass) return showPremiumModal("Error", "Please enter Username and Password", "alert");

    try {
    const { data, error } = await db.from('users')
        .select('*')
        .eq('username', input)
        .eq('password', pass); 

    if (error) {
        console.error("Supabase Login Error:", error);
        showPremiumModal("Database Error", error.message || "Query failed", "alert");
        return;
    }

    if (data && data.length > 0) {
        currentUser = data[0];
        loginSuccess();
    } else {
        showPremiumModal("Login Failed", "Invalid Username or Password", "alert");
    }
} catch (error) {
    console.error(error); // Console mein error check karne ke liye
    showPremiumModal("Error", "Database Connection Error.", "alert");
    }
}

function loginSuccess() {
    localStorage.setItem('activeUser', JSON.stringify(currentUser));
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('publicMenu').classList.add('hidden');
    loadDashboard();
    navigate('dashboard');
}

function logout() {
    localStorage.removeItem('activeUser'); localStorage.removeItem('lastPage');
    currentUser = null; loadPublicMenu(); navigate('auth');
}

function loadDashboard() {
    document.getElementById('userNameDisplay').innerText = currentUser.name;
    document.getElementById('publicMenu').classList.add('hidden');
    
    if (currentUser.role === 'admin') {
        document.getElementById('adminMenu').classList.remove('hidden');
        document.getElementById('adminDash').classList.remove('hidden');
    } else {
        document.getElementById('userMenu').classList.remove('hidden');
        document.getElementById('userDash').classList.remove('hidden');
    }
}

function loadPublicMenu() {
    document.getElementById('publicMenu').classList.remove('hidden');
    document.getElementById('adminMenu').classList.add('hidden');
    document.getElementById('userMenu').classList.add('hidden');
}

// ===============================
// OTP & REGISTRATION FLOW
// ===============================
async function fetchAndRenderUsers() {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    try {
        const { data, error } = await db.from('users').select('*').order('timestamp', { ascending: false });
        tbody.innerHTML = '';
        if (!data || data.length === 0) return tbody.innerHTML = '<tr><td colspan="3">No users found.</td></tr>';

        data.forEach(u => {
            const joinDate = u.timestamp ? new Date(u.timestamp).toLocaleDateString('en-IN') : 'N/A';
            tbody.innerHTML += `<tr><td>${u.name}</td><td>${u.username}</td><td>${joinDate}</td></tr>`;
        });
        document.getElementById('totalUsersCount').innerText = data.length;
    } catch(error) { tbody.innerHTML = '<tr><td colspan="3">Error loading users.</td></tr>'; }
}

function generateCaptcha(elementId) {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    currentCaptchaAnswer = num1 + num2;
    document.getElementById(elementId).innerText = `${num1} + ${num2} = ?`;
}

// STEP 1: OTP Sent
async function verifyCaptchaAndSendOTP(flow) { emailjs.init("2NeRhM2Q3vvkIMBzG");
    const nameId = flow === 'admin' ? 'amName' : 'refName';
    const emailId = flow === 'admin' ? 'amEmail' : 'refEmail';
    const captchaId = flow === 'admin' ? 'amCaptchaInput' : 'refCaptchaInput';

    let name = document.getElementById(nameId).value.trim();
    let email = document.getElementById(emailId).value.trim().toLowerCase();
    let userCaptcha = parseInt(document.getElementById(captchaId).value);

    if (!name || !email) return showPremiumModal("Error", "Name and Email are mandatory!", "alert");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showPremiumModal("Invalid Email", "Please enter a valid email format.", "alert");

    if (isNaN(userCaptcha) || userCaptcha !== currentCaptchaAnswer) {
        generateCaptcha(flow === 'admin' ? 'amCaptchaText' : 'refCaptchaText');
        document.getElementById(captchaId).value = ""; 
        return showPremiumModal("Security Check Failed", "Incorrect math answer. Please try again.", "alert");
    }

    showPremiumModal("Checking...", "Verifying email address...", "progress");

    try {
        const { data: existingUser } = await db.from('users').select('id').eq('email', email).single();
        if (existingUser) {
            closePremiumModal();
            return showPremiumModal("Email Exists", "This email is already registered.", "alert");
        }

        currentOTP = Math.floor(100000 + Math.random() * 900000).toString();
        tempRegisterData = { name, email, role: 'user', purchased: [], timestamp: Date.now(), flow };

        // 📧 SEND OTP EMAIL 
        console.log(emailjs)
        await emailjs.send("service_fbut1on", "template_4agbi0r", {
            to_name: name,
            to_email: email,
            otp: currentOTP 
        });

        closePremiumModal();
        injectOTPUI(flow);
    } catch (error) {
        console.error("Database/Email Error:", error);
        closePremiumModal();
        let errorMsg = error.text || error.message || "Unknown Network Error";
        
        showPremiumModal("System Error ❌", `Details: ${errorMsg}\n\nCheck if your Service ID and Template ID are correct in EmailJS dashboard.`, "alert");
    }
}

function injectOTPUI(flow) {
    const targetDiv = flow === 'admin' ? document.getElementById('amStep1') : document.getElementById('refStep1');
    targetDiv.classList.add('hidden');
    
    const otpDivId = flow + 'OTPStep';
    let otpDiv = document.getElementById(otpDivId);
    
    if(!otpDiv) {
        otpDiv = document.createElement('div');
        otpDiv.id = otpDivId;
        otpDiv.innerHTML = `
            <h3 style="color:#fff; margin-bottom:10px;">Enter Verification Code</h3>
            <p style="color:#aaa; font-size:0.9rem; margin-bottom:20px;">We sent a 6-digit code to ${tempRegisterData.email}</p>
            <input id="${flow}OTPInput" type="number" placeholder="Enter 6-digit OTP" style="text-align:center; letter-spacing:4px; font-size:1.2rem; background: rgba(0,0,0,0.3); color: #fff; padding: 14px; border: 1px solid #333; border-radius: 10px; width: 100%; box-sizing: border-box;">
            <button onclick="verifyOTPAndProceed('${flow}')" class="btn-glow" style="margin-top:20px;">Verify Code</button>
        `;
        targetDiv.parentNode.insertBefore(otpDiv, targetDiv.nextSibling);
    } else {
        otpDiv.classList.remove('hidden');
    }
}

// STEP 2: Verify OTP
function verifyOTPAndProceed(flow) {
    const userInput = document.getElementById(`${flow}OTPInput`).value.trim();
    if(userInput !== currentOTP) return showPremiumModal("Invalid Code", "The OTP you entered is incorrect.", "alert");
    
    document.getElementById(`${flow}OTPStep`).classList.add('hidden');
    
    if (flow === 'admin') finalizeUserCreation('admin'); 
    else document.getElementById('refStep2').classList.remove('hidden'); 
}

// STEP 3: Finalize DB & Welcome Email
async function finalizeUserCreation(flow) {
    const cleanName = tempRegisterData.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const genUser = cleanName + Math.floor(100 + Math.random() * 900);
    const genPass = Math.random().toString(36).slice(-8);

    tempRegisterData.username = genUser; tempRegisterData.password = genPass;
    const insertData = { ...tempRegisterData }; delete insertData.flow;

    showPremiumModal("Processing...", "Creating user profile & sending welcome email...", "alert");

    try {
        const { error } = await db.from('users').insert([insertData]); 
        if (error) throw error;
        
        // 📧 SEND WELCOME CREDENTIALS
        try {
            await emailjs.send("service_fbut1on", "template_eq54bvh", {
                to_name: insertData.name,
                to_email: insertData.email,
                username: genUser,
                password: genPass
            });
        } catch (emailError) { console.error("Email failed:", emailError); }

        closePremiumModal();

        if (flow === 'admin') {
            document.getElementById('amSuccess').classList.remove('hidden');
            document.getElementById('genUser').innerText = genUser;
            document.getElementById('genPass').innerText = genPass;
            document.getElementById('amName').value = ""; document.getElementById('amEmail').value = ""; 
            generateCaptcha('amCaptchaText');
        } else {
            document.getElementById('refStep2').classList.add('hidden'); 
            document.getElementById('refSuccess').classList.remove('hidden');
            document.getElementById('refGenUser').innerText = genUser;
            document.getElementById('refGenPass').innerText = genPass;
        }
    } catch (e) { showPremiumModal("System Error", "Could not create user account.", "alert"); }
}

// ===============================
// RAZORPAY & TRANSACTIONS
// ===============================
function payWithRazorpay() {
    var options = {
        "key": "rzp_test_SOagilh6j038Ec", "amount": "49900", "currency": "INR",
        "name": "Pax Learnify", "description": "Account Creation Fee",
        "image": "https://uploads.onecompiler.io/4444s4cvz/44d69n6eu/1000014528.png",
        "handler": async function (response) {
            showPremiumModal("Processing...", "Payment verified! Creating account...", "alert");
            try {
                await db.from('transactions').insert([{
                    email: tempRegisterData.email, amount: 499,
                    paymentId: response.razorpay_payment_id, status: "Success", timestamp: Date.now()
                }]);
                finalizeUserCreation('user');
            } catch (error) { showPremiumModal("Error", "Payment successful, but failed to save record.", "alert"); }
        },
        "prefill": { "name": tempRegisterData.name, "email": tempRegisterData.email },
        "theme": { "color": "#8e2de2" }
    };
    var rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response){ showPremiumModal("Payment Failed", "Reason: " + response.error.description, "alert"); });
    rzp1.open();
}

function buyCourse(courseId, price, title) {
    var amountInPaise = parseInt(price) * 100; 
    var options = {
        "key": "rzp_test_SOagilh6j038Ec", "amount": amountInPaise.toString(), "currency": "INR",
        "name": "Pax Learnify", "description": "Unlock Course: " + title,
        "image": "https://uploads.onecompiler.io/4444s4cvz/44d69n6eu/1000014528.png",
        "handler": async function (response) {
            showPremiumModal("Processing...", "Payment verified! Unlocking your course...", "alert");
            try {
                await db.from('transactions').insert([{
                    userId: currentUser.id, email: currentUser.email || 'N/A',
                    courseId: courseId, courseTitle: title, amount: price,
                    paymentId: response.razorpay_payment_id, timestamp: Date.now()
                }]);

                if(!currentUser.purchased) currentUser.purchased = [];
                currentUser.purchased.push(courseId);

                await db.from('users').update({ purchased: currentUser.purchased }).eq('id', currentUser.id);

                localStorage.setItem('activeUser', JSON.stringify(currentUser));
                closePremiumModal();
                showPremiumModal("Success 🎉", "Course Unlocked! You can now access all contents.", "alert");
                
                renderUserDashboard(); openCoursePlayer(courseId);
            } catch (error) { showPremiumModal("Error", "Payment done but database error. Contact Support.", "alert"); }
        },
        "prefill": { "name": currentUser.name, "email": currentUser.email || "" },
        "theme": { "color": "#8e2de2" }
    };
    var rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response){ showPremiumModal("Payment Failed", "Reason: " + response.error.description, "alert"); });
    rzp1.open();
}

// ===============================
// COURSE MANAGEMENT & UPLOAD
// ===============================
async function fetchCourses() {
    const { data: courses, error } = await db.from('courses').select('*').order('timestamp', { ascending: false });
    return courses || [];
}

async function renderManageCourses() {
    const list = document.getElementById('manageCourseList');
    list.innerHTML = '<div style="color:#aaa; padding:10px;">Loading Active Courses...</div>';
    const courses = await fetchCourses();
    
    if (courses.length === 0) return list.innerHTML = '<div style="color:#aaa; padding:10px; text-align:center;">No active courses found.</div>';
    
    list.innerHTML = '';
    courses.forEach(c => {
        list.innerHTML += `
        <div class="wide-action-card" style="cursor:default; display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.03);">
            <div style="display:flex; align-items:center;">
                <img src="${c.thumb}" style="width:65px; height:65px; object-fit:cover; border-radius:12px; border: 1px solid var(--neon-blue); margin-right:15px;">
                <div><h3 style="margin:0; font-size:1.1rem; color:#fff;">${c.title}</h3><p style="margin:5px 0 0; font-size:0.85rem; color:#aaa;">₹${c.price} • ${c.type.toUpperCase()}</p></div>
            </div>
            <div>
                <button onclick="deleteCourse('${c.id}')" style="background:rgba(255, 71, 87, 0.1); color:#ff4757; border:1px solid #ff4757; padding:10px 15px; border-radius:10px; cursor:pointer; font-weight:bold; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-trash-alt"></i> Delete
                </button>
            </div>
        </div>`;
    }); 
}

async function deleteCurrentCourse(courseId) {
    const conf = await showPremiumModal("Confirm Action", "Are you sure you want to delete this course?", "confirm");
    if (conf) {
        showPremiumModal("Deleting...", "Removing course...", "alert");
        try {
            console.log("Deleting ID:", activeCourseId);

await db.from('courses')
    .delete()
    .eq('id', Number(CourseId));
            closePremiumModal(); renderManageCourses(); 
            showPremiumModal("Success", "Course deleted.", "alert");
        } catch (e) { showPremiumModal("Error", "Failed to delete course.", "alert"); }
    }
}

function previewFiles(type) {
    if(type !== "thumb") return;
    const file = document.getElementById("cThumb").files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => document.getElementById("thumbPreviewText").innerHTML = `<img src="${e.target.result}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;">`;
    reader.readAsDataURL(file);
}

function addFilesToDraft() {
    Array.from(document.getElementById("cFiles").files).forEach(f => pendingCourseFiles.push(f));
    renderDraftFiles(); document.getElementById("cFiles").value = ""; 
}

function renderDraftFiles() {
    const list = document.getElementById("draftFileList"); list.innerHTML = "";
    pendingCourseFiles.forEach((f, index) => {
        list.innerHTML += `
        <div class="file-item-row" style="display:flex; justify-content:space-between; align-items:center;">
            <div class="file-info"><span class="file-name">${f.name}</span><span class="file-type">${f.type}</span></div>
            <button onclick="removeDraftFile(${index})" style="background:#ff4757; border:none; color:white; border-radius:50%; width:30px; height:30px; cursor:pointer;"><i class="fas fa-times"></i></button>
        </div>`;
    });
}

function removeDraftFile(index) { pendingCourseFiles.splice(index, 1); renderDraftFiles(); }

async function createCourse() {
    const title = document.getElementById('cTitle').value;
    if(!title) return showPremiumModal("Error","Title Required", "alert");
    if(pendingCourseFiles.length === 0 && !document.getElementById("cThumb").files[0]) return showPremiumModal("Error","Please add at least one file or cover image.", "alert");

    showPremiumModal("Preparing Upload", "Connecting to server...", "progress");

    const thumbFile = document.getElementById("cThumb").files[0];
    let thumbUrl = "https://via.placeholder.com/800x450?text=Course";

    try {
        if(thumbFile){
            updateUploadProgress(30, "Uploading Cover Image...");
            const { data, error } = await supabaseClient.storage.from('thumbnails').upload(`public/${Date.now()}_${thumbFile.name}`, thumbFile);
            if(error) throw error;
            thumbUrl = supabaseClient.storage.from('thumbnails').getPublicUrl(data.path).data.publicUrl;
        }

        const newCourse = {
            title: title, desc: document.getElementById('cDesc').value,
            type: document.getElementById('cType').value, price: document.getElementById('cPrice').value || 0,
            thumb: thumbUrl, files: [], timestamp: Date.now()
        };

        for (let i = 0; i < pendingCourseFiles.length; i++) {
            let file = pendingCourseFiles[i];
            let simProg = 40;
            const progInterval = setInterval(() => {
                if(simProg < 90) { simProg += 5; updateUploadProgress(simProg, `Uploading File ${i+1}/${pendingCourseFiles.length}: ${file.name}...`); }
            }, 500);

            const { data, error } = await supabaseClient.storage.from('course_materials').upload(`public/${Date.now()}_${file.name}`, file);
            clearInterval(progInterval);
            if(error) throw error;
            
            const fileUrl = supabaseClient.storage.from('course_materials').getPublicUrl(data.path).data.publicUrl;
            newCourse.files.push({ name: file.name, type: file.type, url: fileUrl });
        }

        updateUploadProgress(100, "Finalizing Database Entry...");
        await db.from('courses').insert([newCourse]);
        
        document.getElementById('cTitle').value = ""; document.getElementById('cDesc').value = "";
        document.getElementById('cFiles').value = ""; document.getElementById('cThumb').value = "";
        document.getElementById('thumbPreviewText').innerHTML = "Tap to select image";
        pendingCourseFiles = []; renderDraftFiles();
        
        closePremiumModal(); navigate("manage-courses");
        showPremiumModal("Success 🎉", "Course has been published successfully!", "alert");
    } catch (error) { closePremiumModal(); showPremiumModal("Upload Failed ❌", error.message || "Network error.", "alert"); }
}

function togglePriceInput() {
    document.getElementById("priceInputContainer").style.display = document.getElementById("cType").value === "free" ? "none" : "block";
}

// ===============================
// PLAYER & DASHBOARDS
// ===============================
async function openCoursePlayer(courseId) {
    activeCourseId = courseId;

    const courses = await fetchCourses();
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    // ===== ACCESS CONTROL =====
    if (!currentUser.purchased) currentUser.purchased = [];

    const isFree = course.type === 'free';
    const isPurchased = currentUser.purchased.includes(courseId);
    const isAdmin = currentUser.role === 'admin';

    if (!isFree && !isPurchased && !isAdmin) {
        const wantToBuy = await showPremiumModal(
            "Course Locked 🔒",
            `This is a Premium Course.\nYou need to purchase it for ₹${course.price}`,
            "confirm"
        );
        if (wantToBuy) buyCourse(course.id, course.price, course.title);
        return;
    }

    // ===== NAVIGATION =====
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    document.getElementById('coursePlayerView').classList.remove('hidden');

    // ===== BASIC INFO =====
    document.getElementById('playerTitle').innerText = course.title;
    document.getElementById('playerDesc').innerText = course.desc || "";

    // ===== BANNER (cache fix) =====
    const thumb = course.thumb && course.thumb.trim() !== ""
        ? course.thumb
        : "https://via.placeholder.com/800x450?text=No+Preview";

    document.getElementById('mainMediaContainer').innerHTML =
        `<img src="${thumb}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;">`;

    // ===== FILE LIST =====
    const list = document.getElementById("playerFileList");
    list.innerHTML = "";

    const isEditMode = document.getElementById('editModeToggle').checked;

    // ===== EMPTY STATE =====
    if (!course.files || course.files.length === 0) {
        list.innerHTML = `
            <p style="text-align:center;color:#888;">
                No files available in this course
            </p>`;
        return;
    }

    // ===== RENDER FILES =====
    (course.files || []).forEach((file, index) => {
        const iconClass = file.type.includes('pdf') ? 'fa-file-pdf' : 'fa-play-circle';

        list.innerHTML += `
        <div class="file-item">
            <span onclick="openFile('${file.url}','${file.type}','${file.name}')"
                style="cursor:pointer; display:flex; align-items:center; gap:10px;">
                <i class="fas ${iconClass}"></i> ${file.name}
            </span>

            ${isEditMode ? `
            <button class="file-delete-btn" onclick="deleteSpecificFile(${index})">
                <i class="fas fa-trash"></i>
            </button>` : ''}
        </div>`;
    });

    // ===== AUTO PLAY FIRST FILE (🔥 PRO UX) =====
    const firstFile = course.files[0];
    if (firstFile) {
        openFile(firstFile.url, firstFile.type, firstFile.name);
    }
}

async function openFile(url, type, fileName) {
    const mediaContainer = document.getElementById("mainMediaContainer");
    
    // Video Auto-Play Setup
    if (type.includes("video")) {
        mediaContainer.innerHTML = `
            <video id="courseVideoPlayer" src="${url}" controls autoplay controlsList="nodownload" 
                   style="width:100%; height:100%; background:#000;">
            </video>`;
        
        // Video element grab force play (Browser policy handles)
        const v = document.getElementById('courseVideoPlayer');
        v.play().catch(e => console.log("Auto-play prevented by browser, waiting for user interaction."));
    } 
    
    // 2. PDF Document Reader Open 
    else if (type.includes("pdf")) {
        document.getElementById('documentReaderView').classList.remove('hidden');
        document.getElementById('readerDocTitle').innerText = fileName;
        
        const container = document.getElementById('pdfRenderer');
        container.innerHTML = '<div style="color:#333; padding:20px;">Loading Document...</div>';
        
        try {
            const pdf = await pdfjsLib.getDocument(url).promise;
            container.innerHTML = '';
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const canvas = document.createElement('canvas');
                const viewport = page.getViewport({ scale: 1.5 });
                const context = canvas.getContext('2d');

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.style.display = "block";
                canvas.style.margin = "10px auto";
                canvas.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
                
                container.appendChild(canvas);
                await page.render({ canvasContext: context, viewport: viewport }).promise;
            }
        } catch (e) {
            container.innerHTML = '<div style="color:red; padding:20px;">Error loading PDF. Please check if Supabase storage is public.</div>';
        }
    }
}

function closeDocumentReader() {
    document.getElementById('documentReaderView').classList.add('hidden');

    // 🔥 back to course player
    document.getElementById('coursePlayerView').classList.remove('hidden');
}

async function renderDashboard() {
    const slider = document.getElementById('verticalCourseSlider'); slider.innerHTML = '<div style="color:#aaa; padding:10px;">Loading courses...</div>';
    const courses = await fetchCourses(); slider.innerHTML = '';
    if (courses.length === 0) return slider.innerHTML = '<div style="color:#aaa; padding:10px;">No courses found. Create one!</div>';

    courses.forEach(c => {
        const isFree = (c.type === 'free');
        let filesHTML = c.files ? c.files.map(f => `<div class="nac-file-link">${f.type.includes('pdf') ? 'Doc' : 'Video'}</div>`).join('') : '';
        slider.innerHTML += `
        <div class="new-admin-card" onclick="openCoursePlayer('${c.id}')">
            <div class="nac-img-wrapper"><img src="${c.thumb}"></div>
            <div class="nac-content">
                <div class="nac-top-row"><h3 class="nac-title">${c.title}</h3><div class="nac-badge ${isFree ? 'free' : 'paid'}">${isFree ? 'Free' : 'Paid'}</div></div>
                <div class="nac-mid-row"><div class="nac-files">${filesHTML}</div></div>
            </div>
        </div>`;
    });
}

async function renderUserDashboard() {
    try {
        const unlocked = document.getElementById('userUnlockedCourses');
        const locked = document.getElementById('userLockedCourses');
        const store = document.getElementById('storeAllCourses');
        
        // Safety check
        if (!unlocked || !locked || !store) return;

        unlocked.innerHTML = locked.innerHTML = store.innerHTML = '<div style="color:#aaa; padding:10px;">Loading...</div>';

        const courses = await fetchCourses();
        unlocked.innerHTML = locked.innerHTML = store.innerHTML = '';
        
        let hasUnlocked = false; 
        let hasLocked = false;
        
        // 🔥 FIX 1: Ensure purchased list is strictly a valid Array
        if (!currentUser.purchased || !Array.isArray(currentUser.purchased)) {
            currentUser.purchased = [];
        }

        courses.forEach(c => {
            const isFree = (c.type === 'free');
            
            // 🔥 FIX 2: String conversion se strict ID matching
            const isPurchased = currentUser.purchased.some(pId => String(pId) === String(c.id));
            const hasAccess = isFree || isPurchased || currentUser.role === 'admin';
            
            const cardHTML = `
            <div class="new-admin-card" onclick="openCoursePlayer('${c.id}')">
                <div class="nac-img-wrapper"><img src="${c.thumb}"></div>
                <div class="nac-content">
                    <div class="nac-top-row">
                        <h3 class="nac-title">${c.title}</h3>
                        <div class="nac-badge ${isFree ? 'free' : 'paid'}">${isFree ? 'Free' : '₹' + c.price}</div>
                    </div>
                    <div class="nac-bottom-row" style="margin-top: 15px;">
                        ${hasAccess 
                            ? `<button class="nac-active-btn" style="width:100%; border-radius:10px;">Play Course <i class="fas fa-play"></i></button>` 
                            : `<button class="btn-glow" style="margin:0; padding:10px; font-size:0.9rem; border-radius:10px;">Buy to Unlock</button>`}
                    </div>
                </div>
            </div>`;
            
            if (hasAccess) { 
                unlocked.innerHTML += cardHTML; 
                hasUnlocked = true; 
            } else { 
                locked.innerHTML += cardHTML; 
                store.innerHTML += cardHTML; 
                hasLocked = true; 
            }
        });

        if (!hasUnlocked) unlocked.innerHTML = '<div style="color:#aaa; padding:10px;">No unlocked courses yet. Explore below!</div>';
        if (!hasLocked) { 
            locked.innerHTML = '<div style="color:#aaa; padding:10px;">You have unlocked all available courses!</div>'; 
            store.innerHTML = '<div style="color:#aaa; padding:10px;">Store is empty. You own everything!</div>'; 
        }

    } catch (error) {
        console.error("Dashboard Render Error:", error);
        document.getElementById('userUnlockedCourses').innerHTML = '<div style="color:red; padding:10px;">Error loading dashboard. Please refresh.</div>';
    }
}

async function renderEarnings() {
    const tbody = document.querySelector('#txnTable tbody'); tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#aaa;">Loading Transactions...</td></tr>';
    try {
        const { data } = await db.from('transactions').select('*').order('timestamp', { ascending: false });
        tbody.innerHTML = '';
        if (!data || data.length === 0) return tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#aaa;">No transactions yet.</td></tr>';

        let totalEarnings = 0;
        data.forEach(d => {
            const amt = Number(d.amount || 0); totalEarnings += amt;
            tbody.innerHTML += `<tr>
                <td><span style="font-size:0.85rem; color:#fff;">${d.email || 'User'}</span><br><span style="font-size:0.7rem; color:#aaa;">${new Date(d.timestamp).toLocaleDateString()}</span></td>
                <td><span style="font-size:0.85rem;">${d.courseTitle || 'Unlock / Reg'}</span></td>
                <td style="color:#00ff41; font-weight:bold;">₹${amt}</td>
            </tr>`;
        });
        document.getElementById('adEarnings').innerText = totalEarnings;
    } catch (error) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#ff4757;">Error loading earnings.</td></tr>'; }
}

async function updateAdminEarningsWidget() {
    const { data } = await db.from('transactions').select('amount');
    if(data) document.getElementById('adEarnings').innerText = data.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
}

// ===============================
// PROFILE & UTILS
// ===============================
async function saveProfileSettings() {
    const newName = document.getElementById('editDisplayName').value.trim();
    if (!newName) return;
    if (currentUser && currentUser.id) {
        try {
            await db.from('users').update({ name: newName }).eq('id', currentUser.id);
            currentUser.name = newName; localStorage.setItem('activeUser', JSON.stringify(currentUser));
            document.getElementById('userNameDisplay').innerText = newName; showPremiumModal("Success", "Name Updated", "alert");
        } catch(error) { showPremiumModal("Error", "Could not update profile.", "alert"); }
    }
}

async function deleteUserAccount() {
    const enteredPass = await showPremiumModal("Danger Zone", "Please enter your Password to confirm Account Deletion", "prompt");
    if (enteredPass === currentUser.password) {
        if(currentUser && currentUser.id) {
            showPremiumModal("Deleting...", "Removing your data...", "alert");
            await db.from('users').delete().eq('id', currentUser.id); logout();
        } else { logout(); }
    } else if (enteredPass) { showPremiumModal("Access Denied", "Incorrect Password! Account deletion cancelled.", "alert"); }
}

function navigate(viewName) {
    if (!currentUser && viewName !== 'auth' && viewName !== 'about') {
        document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
        document.getElementById('authScreen').classList.remove('hidden'); return;
    }
    if (viewName !== 'auth') localStorage.setItem('lastPage', viewName);
    
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden')); closeSidebar();

    switch(viewName) {
        case 'auth': document.getElementById('authScreen').classList.remove('hidden'); break;
        case 'dashboard': currentUser.role === 'admin' ? (document.getElementById('adminDash').classList.remove('hidden'), renderDashboard()) : (document.getElementById('userDash').classList.remove('hidden'), renderUserDashboard()); break;
        case 'manage-courses': document.getElementById('manageCoursesView').classList.remove('hidden'); renderManageCourses(); break;
        case 'add-member': 
            document.getElementById('addMemberView').classList.remove('hidden'); document.getElementById('amStep1').classList.remove('hidden'); document.getElementById('amSuccess').classList.add('hidden');
            if(document.getElementById('adminOTPStep')) document.getElementById('adminOTPStep').classList.add('hidden');
            generateCaptcha('amCaptchaText'); break;
        case 'referrals': 
            document.getElementById('userReferralsView').classList.remove('hidden'); document.getElementById('refStep1').classList.remove('hidden'); document.getElementById('refStep2').classList.add('hidden'); document.getElementById('refSuccess').classList.add('hidden');
            if(document.getElementById('userOTPStep')) document.getElementById('userOTPStep').classList.add('hidden');
            generateCaptcha('refCaptchaText'); break;
        case 'users-list': document.getElementById('usersListView').classList.remove('hidden'); fetchAndRenderUsers(); break;
        case 'add-course': document.getElementById('addCourseView').classList.remove('hidden'); break;
        case 'store': document.getElementById('userStoreView').classList.remove('hidden'); renderUserDashboard(); break;
        case 'settings': document.getElementById('userSettingsView').classList.remove('hidden'); break;
        case 'earnings': document.getElementById('earningsView').classList.remove('hidden'); renderEarnings(); break;
        case 'about': document.getElementById('aboutView').classList.remove('hidden'); break;
    }
}

function toggleSidebar() {
    document.getElementById("mySidebar").classList.toggle("active");
    document.getElementById("sidebarOverlay").style.display = document.getElementById("mySidebar").classList.contains("active") ? "block" : "none";
}
function closeSidebar() { document.getElementById("mySidebar").classList.remove("active"); document.getElementById("sidebarOverlay").style.display = "none"; }

function showPremiumModal(title, message, type = 'alert') {
    return new Promise((resolve) => {
        document.getElementById('pmTitle').innerText = title; document.getElementById('pmMessage').innerText = message;
        const inputField = document.getElementById('pmInput'); const cancelBtn = document.getElementById('pmCancelBtn'); const confirmBtn = document.getElementById('pmConfirmBtn'); const progContainer = document.getElementById('pmProgressContainer'); const progText = document.getElementById('pmProgressText');
        
        inputField.value = ''; inputField.classList.add('hidden'); cancelBtn.classList.add('hidden');
        progContainer.classList.add('hidden'); progText.classList.add('hidden'); confirmBtn.classList.remove('hidden');
        
        if (type === 'prompt') { inputField.classList.remove('hidden'); cancelBtn.classList.remove('hidden'); }
        else if (type === 'confirm') { cancelBtn.classList.remove('hidden'); }
        else if (type === 'progress') { 
            confirmBtn.classList.add('hidden'); progContainer.classList.remove('hidden'); progText.classList.remove('hidden');
            document.getElementById('pmProgressBar').style.width = '0%'; progText.innerText = '0%';
        }
        document.getElementById('premiumModal').classList.remove('hidden'); modalPromiseResolve = resolve;
    });
}

function updateUploadProgress(percent, htmlText) {
    document.getElementById('pmProgressBar').style.width = percent + '%';
    if(htmlText) document.getElementById('pmProgressText').innerHTML = htmlText;
}

function closePremiumModal(isConfirm) {
    document.getElementById('premiumModal').classList.add('hidden');
    if (modalPromiseResolve) {
        const inputField = document.getElementById('pmInput');
        modalPromiseResolve(isConfirm ? (!inputField.classList.contains('hidden') ? inputField.value.trim() : true) : (!inputField.classList.contains('hidden') ? null : false));
        modalPromiseResolve = null;
    }
}