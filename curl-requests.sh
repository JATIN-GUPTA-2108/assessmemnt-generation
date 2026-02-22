# Curl requests for manual testing
# Update these values before running.

BASE_URL="http://localhost:3000"
USER_ID="user-1"
ASSESSMENT_ID="<assessment_id_from_db_or_job_result>"
SESSION_ID="<session_id_after_opt_in>"
JOB_ID="<job_id_after_generation_trigger>"

# 1) Health check
curl --location "$BASE_URL/health"

# 2) Upload syllabus PDFs (multipart)
# Replace local file paths with your PDF files.
curl --location "$BASE_URL/admin/syllabus/upload" \
  --form "files=@C:/path/to/Math.pdf" \
  --form "files=@C:/path/to/Physics.pdf"

# 3) Trigger async assessment generation
curl --location --request POST "$BASE_URL/assessments/generate"
# Save jobId from response into JOB_ID.

# 4) Check generation job status
curl --location "$BASE_URL/jobs/$JOB_ID"

# 5) Create session (opt-in)
curl --location --request POST "$BASE_URL/sessions/opt-in" \
  --header "Content-Type: application/json" \
  --data "{\"userId\":\"$USER_ID\",\"assessmentId\":\"$ASSESSMENT_ID\"}"
# Save id from response into SESSION_ID.

# 6) Start session
curl --location --request POST "$BASE_URL/sessions/start" \
  --header "Content-Type: application/json" \
  --data "{\"sessionId\":\"$SESSION_ID\",\"userId\":\"$USER_ID\"}"

# 7) Submit section 0
curl --location --request POST "$BASE_URL/sessions/$SESSION_ID/submit-section" \
  --header "Content-Type: application/json" \
  --data "{\"userId\":\"$USER_ID\",\"sectionId\":\"SEC-1\",\"sectionIndex\":0,\"answers\":{\"Q1\":\"My answer\",\"Q2\":\"My second answer\"}}"

# 8) Submit section 1 (must be sequential)
curl --location --request POST "$BASE_URL/sessions/$SESSION_ID/submit-section" \
  --header "Content-Type: application/json" \
  --data "{\"userId\":\"$USER_ID\",\"sectionId\":\"SEC-2\",\"sectionIndex\":1,\"answers\":{\"Q3\":\"Answer 3\",\"Q4\":\"Answer 4\"}}"

# 9) Complete session (triggers async evaluation job)
curl --location --request POST "$BASE_URL/sessions/$SESSION_ID/complete" \
  --header "Content-Type: application/json" \
  --data "{\"userId\":\"$USER_ID\"}"

# 10) Fetch session with submissions/state
curl --location "$BASE_URL/sessions/$SESSION_ID?userId=$USER_ID"

# 11) Optional concurrency checks
# Run these two commands at same time to verify duplicate completion protection.
# Terminal A
curl --location --request POST "$BASE_URL/sessions/$SESSION_ID/complete" \
  --header "Content-Type: application/json" \
  --data "{\"userId\":\"$USER_ID\"}"
# Terminal B
curl --location --request POST "$BASE_URL/sessions/$SESSION_ID/complete" \
  --header "Content-Type: application/json" \
  --data "{\"userId\":\"$USER_ID\"}"
