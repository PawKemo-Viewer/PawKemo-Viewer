use reqwest::header::{
    HeaderMap,
    HeaderValue,
    ACCEPT,
    ACCEPT_LANGUAGE,
    COOKIE,
    ORIGIN,
    REFERER,
    USER_AGENT,
};

#[tauri::command]
async fn api_request(
    path: String,
    method: String,
    session_key: Option<String>,
) -> Result<String, String> {
    let path = path.trim_start_matches('/');

    let url = format!(
        "https://pawchive.pw/api/v1/{}",
        path
    );

    println!("REQUEST => {}", url);

    let client = reqwest::Client::builder()
        .brotli(true)
        .gzip(true)
        .build()
        .map_err(|e| e.to_string())?;

    let mut headers = HeaderMap::new();

    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        ),
    );

    headers.insert(
        ACCEPT,
        HeaderValue::from_static(
            "application/json,text/plain,*/*",
        ),
    );

    headers.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static(
            "ja,en-US;q=0.9,en;q=0.8",
        ),
    );

    headers.insert(
        REFERER,
        HeaderValue::from_static(
            "https://pawchive.pw/",
        ),
    );

    headers.insert(
        ORIGIN,
        HeaderValue::from_static(
            "https://pawchive.pw",
        ),
    );

    if let Some(session) = session_key {
        if !session.is_empty() {
            let cookie =
                format!("session={}", session);

            headers.insert(
                COOKIE,
                HeaderValue::from_str(&cookie)
                    .map_err(|e| e.to_string())?,
            );
        }
    }

    println!("METHOD => {}", method);

    let response = match method.as_str() {
        "POST" => {
            client
                .post(&url)
                .headers(headers)
                .send()
                .await
        }

        "DELETE" => {
            client
                .delete(&url)
                .headers(headers)
                .send()
                .await
        }

        _ => {
            client
                .get(&url)
                .headers(headers)
                .send()
                .await
        }
    }
    .map_err(|e| e.to_string())?;

    let status = response.status();

    let response_headers =
        response.headers().clone();

    let text = response
        .text()
        .await
        .map_err(|e| e.to_string())?;

    println!("STATUS => {}", status);

    if !status.is_success() {
        return Err(
            format!(
                "STATUS={}\nHEADERS={:#?}\nBODY={}",
                status,
                response_headers,
                text
            )
        );
    }

    Ok(text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(
            tauri::generate_handler![
                api_request
            ]
        )
        .run(
            tauri::generate_context!()
        )
        .expect(
            "error while building tauri application",
        );
}