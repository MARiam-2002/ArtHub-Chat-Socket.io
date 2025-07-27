# ArtHub Chat Service

خدمة المحادثات الفورية المنفصلة لـ ArtHub - تعمل على Railway

## 🎯 الهدف

هذه الخدمة مخصصة للمحادثات الفورية فقط، بينما يبقى باقي API على Vercel. هذا الحل يسمح بـ:

- ✅ **WebSockets** على Railway
- ✅ **REST APIs** على Vercel
- ✅ **تكامل كامل** بين الخدمتين
- ✅ **أداء ممتاز** لكل خدمة

## 🏗️ البنية

```
ArtHub Platform
├── Main API (Vercel)
│   ├── Authentication
│   ├── Artworks
│   ├── Users
│   ├── Orders
│   └── ... (كل شيء ما عدا المحادثات)
│
└── Chat Service (Railway)
    ├── Socket.IO
    ├── Real-time messaging
    ├── Typing indicators
    └── Read receipts
```

## 🚀 النشر على Railway

### 1. **إعداد المشروع**

```bash
# انسخ مجلد chat-service
cp -r chat-service /path/to/your/project

# اذهب للمجلد
cd chat-service

# ثبت التبعيات
npm install
```

### 2. **إعداد Railway**

```bash
# تثبيت Railway CLI
npm install -g @railway/cli

# تسجيل الدخول
railway login

# تهيئة المشروع
railway init

# رفع الكود
railway up
```

### 3. **إعداد متغيرات البيئة**

```bash
# إضافة متغيرات البيئة
railway variables set CONNECTION_URL="your_mongodb_url"
railway variables set TOKEN_KEY="your_jwt_secret"
railway variables set MAIN_API_URL="https://your-vercel-app.vercel.app"
railway variables set INTERNAL_API_KEY="your_internal_api_key"
railway variables set NODE_ENV="production"
railway variables set ALLOWED_ORIGINS="https://your-frontend.com"
```

## 🔧 التكامل مع التطبيق الرئيسي

### 1. **تحديث Frontend**

```javascript
// في التطبيق الأمامي
const CHAT_SERVICE_URL = 'https://your-chat-service.railway.app';

// إنشاء اتصال Socket.IO
const socket = io(CHAT_SERVICE_URL, {
  transports: ['websocket'],
  auth: {
    token: userToken
  }
});

// مصادقة المستخدم
socket.emit('authenticate', { token: userToken });

// الانضمام لمحادثة
socket.emit('join_chat', { 
  chatId: 'chat_id_here',
  token: userToken 
});

// إرسال رسالة
socket.emit('send_message', {
  chatId: 'chat_id_here',
  content: 'رسالة جديدة',
  token: userToken
});
```

### 2. **تحديث Main API**

أضف endpoint جديد في Main API للتواصل مع Chat Service:

```javascript
// في src/modules/notification/notification.controller.js
export const sendChatNotification = asyncHandler(async (req, res) => {
  const { userId, chatId, senderId, message } = req.body;
  
  // إرسال إشعار للمستخدم
  await sendPushNotificationToUser(
    userId,
    'رسالة جديدة',
    message,
    {
      type: 'chat',
      chatId,
      senderId
    }
  );
  
  res.success({}, 'تم إرسال الإشعار بنجاح');
});
```

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Chat Status
```
GET /api/chat/status
```

## 🔌 Socket.IO Events

### Client → Server
- `authenticate` - مصادقة المستخدم
- `join_chat` - الانضمام لمحادثة
- `send_message` - إرسال رسالة
- `typing` - مؤشر الكتابة
- `stop_typing` - إيقاف مؤشر الكتابة
- `mark_read` - وضع علامة مقروء

### Server → Client
- `authenticated` - تأكيد المصادقة
- `new_message` - رسالة جديدة
- `user_typing` - مستخدم يكتب
- `user_stopped_typing` - مستخدم توقف عن الكتابة
- `messages_read` - رسائل مقروءة
- `error` - رسالة خطأ

## 🔐 الأمان

### 1. **JWT Authentication**
- كل طلب Socket.IO يحتاج token صحيح
- التحقق من صلاحية المستخدم لكل محادثة

### 2. **CORS Protection**
- إعداد CORS للـ frontend domains فقط
- حماية من طلبات غير مصرح بها

### 3. **Rate Limiting**
- حماية من spam messages
- تحديد عدد الرسائل لكل مستخدم

## 📊 المراقبة

### Health Check
```bash
curl https://your-chat-service.railway.app/health
```

### Status Check
```bash
curl https://your-chat-service.railway.app/api/chat/status
```

## 🚨 استكشاف الأخطاء

### 1. **مشاكل الاتصال**
```bash
# تحقق من Railway logs
railway logs

# تحقق من متغيرات البيئة
railway variables
```

### 2. **مشاكل Socket.IO**
```javascript
// في Frontend
socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

### 3. **مشاكل Database**
```bash
# تحقق من MongoDB connection
railway logs | grep "MongoDB"
```

## 🔄 التحديثات

### 1. **تحديث الكود**
```bash
# رفع التحديثات
git add .
git commit -m "Update chat service"
git push origin main

# نشر على Railway
railway up
```

### 2. **تحديث متغيرات البيئة**
```bash
railway variables set NEW_VARIABLE="new_value"
```

## 📈 الأداء

### 1. **Optimizations**
- استخدام MongoDB indexes
- Caching للـ user data
- Connection pooling

### 2. **Monitoring**
- Railway built-in monitoring
- Custom health checks
- Error tracking

## 🎉 الخلاصة

هذا الحل يوفر:
- ✅ **WebSockets** على Railway
- ✅ **REST APIs** على Vercel
- ✅ **تكامل كامل** بين الخدمتين
- ✅ **أداء ممتاز** لكل خدمة
- ✅ **سهولة الصيانة** لكل خدمة منفصلة

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع Railway logs
2. تحقق من متغيرات البيئة
3. اختبر Socket.IO connection
4. تأكد من عمل MongoDB Atlas 