use std::cmp::{max, min};

struct QrSpec {
    version: usize,
    ecc: usize,
    b1: usize,
    d1: usize,
    b2: usize,
    d2: usize,
}

const QR_SPECS_M: [Option<QrSpec>; 11] = [
    None,
    Some(QrSpec { version: 1, ecc: 10, b1: 1, d1: 16, b2: 0, d2: 0 }),
    Some(QrSpec { version: 2, ecc: 16, b1: 1, d1: 28, b2: 0, d2: 0 }),
    Some(QrSpec { version: 3, ecc: 26, b1: 1, d1: 44, b2: 0, d2: 0 }),
    Some(QrSpec { version: 4, ecc: 18, b1: 2, d1: 32, b2: 0, d2: 0 }),
    Some(QrSpec { version: 5, ecc: 24, b1: 2, d1: 43, b2: 0, d2: 0 }),
    Some(QrSpec { version: 6, ecc: 16, b1: 4, d1: 27, b2: 0, d2: 0 }),
    Some(QrSpec { version: 7, ecc: 18, b1: 4, d1: 31, b2: 0, d2: 0 }),
    Some(QrSpec { version: 8, ecc: 22, b1: 2, d1: 38, b2: 2, d2: 39 }),
    Some(QrSpec { version: 9, ecc: 22, b1: 3, d1: 36, b2: 2, d2: 37 }),
    Some(QrSpec { version: 10, ecc: 26, b1: 4, d1: 43, b2: 1, d2: 44 }),
];

const ALIGNMENT_COORDS: [&'static [usize]; 11] = [
    &[],
    &[],
    &[6, 18],
    &[6, 22],
    &[6, 26],
    &[6, 30],
    &[6, 34],
    &[6, 22, 38],
    &[6, 24, 42],
    &[6, 26, 46],
    &[6, 28, 50],
];

struct Tables {
    exp: [u8; 512],
    log: [u8; 256],
}

impl Tables {
    fn new() -> Self {
        let mut exp = [0u8; 512];
        let mut log = [0u8; 256];
        let mut val = 1u16;
        for i in 0..255 {
            exp[i] = val as u8;
            exp[i + 255] = val as u8;
            log[val as usize] = i as u8;
            val = (val << 1) ^ if (val & 128) != 0 { 0x11d } else { 0 };
        }
        Tables { exp, log }
    }

    fn gf_mul(&self, x: u8, y: u8) -> u8 {
        if x == 0 || y == 0 {
            0
        } else {
            self.exp[(self.log[x as usize] as usize) + (self.log[y as usize] as usize)]
        }
    }
}

fn rs_generator_poly(tables: &Tables, num_ecc: usize) -> Vec<u8> {
    let mut poly = vec![1u8];
    for i in 0..num_ecc {
        let factor = tables.exp[i];
        let mut next = vec![0u8; poly.len() + 1];
        for j in 0..poly.len() {
            next[j] ^= poly[j];
            next[j + 1] ^= tables.gf_mul(poly[j], factor);
        }
        poly = next;
    }
    poly
}

fn rs_compute_ecc(tables: &Tables, data: &[u8], num_ecc: usize) -> Vec<u8> {
    let gen_poly = rs_generator_poly(tables, num_ecc);
    let mut rem = vec![0u8; num_ecc];
    for &d in data {
        let factor = d ^ rem[0];
        rem.copy_within(1.., 0);
        rem[num_ecc - 1] = 0;
        for j in 0..num_ecc {
            rem[j] ^= tables.gf_mul(gen_poly[j + 1], factor);
        }
    }
    rem
}

pub fn escape_wifi_string(s: &str) -> String {
    let mut res = String::new();
    for c in s.chars() {
        if matches!(c, '\\' | ';' | ',' | '"' | ':') {
            res.push('\\');
        }
        res.push(c);
    }
    res
}

pub fn build_wifi_qr_string(ssid: &str, password: &str, auth: &str) -> String {
    let clean_ssid = escape_wifi_string(ssid);
    let clean_pass = escape_wifi_string(password);
    let upper = auth.to_uppercase();

    let auth_type = if upper.contains("OPEN") || password.is_empty() {
        "nopass"
    } else if upper.contains("WEP") {
        "WEP"
    } else {
        "WPA"
    };

    if auth_type == "nopass" {
        format!("WIFI:T:nopass;S:{};;", clean_ssid)
    } else {
        format!("WIFI:T:{};S:{};P:{};;", auth_type, clean_ssid, clean_pass)
    }
}

pub fn create_qr_matrix(text: &str) -> Vec<Vec<bool>> {
    let tables = Tables::new();
    let bytes = text.as_bytes();

    let mut selected_spec: Option<&QrSpec> = None;
    for v in 1..=10 {
        if let Some(spec) = &QR_SPECS_M[v] {
            let data_cap = spec.b1 * spec.d1 + spec.b2 * spec.d2;
            let header_bits = 4 + if v <= 9 { 8 } else { 16 };
            let avail_bytes = (data_cap * 8 - header_bits) / 8;
            if bytes.len() <= avail_bytes {
                selected_spec = Some(spec);
                break;
            }
        }
    }
    let spec = selected_spec.expect("Data exceeds QR capacity");

    let total_data_bytes = spec.b1 * spec.d1 + spec.b2 * spec.d2;
    let mut bit_buf = Vec::new();

    // Mode Byte: 0100
    for i in (0..4).rev() {
        bit_buf.push(((0b0100 >> i) & 1) != 0);
    }
    // Char count
    let char_count_bits = if spec.version <= 9 { 8 } else { 16 };
    let len = bytes.len();
    for i in (0..char_count_bits).rev() {
        bit_buf.push(((len >> i) & 1) != 0);
    }
    // Data bytes
    for &b in bytes {
        for i in (0..8).rev() {
            bit_buf.push(((b >> i) & 1) != 0);
        }
    }
    // Terminator
    let rem_bits = total_data_bytes * 8 - bit_buf.len();
    let term = min(4, max(0, rem_bits));
    for _ in 0..term {
        bit_buf.push(false);
    }
    while bit_buf.len() % 8 != 0 {
        bit_buf.push(false);
    }

    let mut data = vec![0u8; total_data_bytes];
    for (i, chunk) in bit_buf.chunks(8).enumerate() {
        let mut b = 0u8;
        for &bit in chunk {
            b = (b << 1) | if bit { 1 } else { 0 };
        }
        data[i] = b;
    }

    let mut pad_idx = bit_buf.len() / 8;
    let mut pad_byte = 0xecu8;
    while pad_idx < total_data_bytes {
        data[pad_idx] = pad_byte;
        pad_idx += 1;
        pad_byte = if pad_byte == 0xec { 0x11 } else { 0xec };
    }

    struct Block {
        data: Vec<u8>,
        ecc: Vec<u8>,
    }
    let mut blocks = Vec::new();
    let mut offset = 0;
    for _ in 0..spec.b1 {
        let bd = data[offset..offset + spec.d1].to_vec();
        offset += spec.d1;
        let ecc = rs_compute_ecc(&tables, &bd, spec.ecc);
        blocks.push(Block { data: bd, ecc });
    }
    for _ in 0..spec.b2 {
        let bd = data[offset..offset + spec.d2].to_vec();
        offset += spec.d2;
        let ecc = rs_compute_ecc(&tables, &bd, spec.ecc);
        blocks.push(Block { data: bd, ecc });
    }

    let mut codewords = Vec::new();
    let max_data = max(spec.d1, spec.d2);
    for i in 0..max_data {
        for b in &blocks {
            if i < b.data.len() {
                codewords.push(b.data[i]);
            }
        }
    }
    for i in 0..spec.ecc {
        for b in &blocks {
            codewords.push(b.ecc[i]);
        }
    }

    let size = spec.version * 4 + 17;
    let mut matrix = vec![vec![None; size]; size];
    let mut is_reserved = vec![vec![false; size]; size];

    fn set_module(matrix: &mut [Vec<Option<u8>>], is_reserved: &mut [Vec<bool>], r: usize, c: usize, v: u8, res: bool) {
        matrix[r][c] = Some(v);
        if res {
            is_reserved[r][c] = true;
        }
    }

    // Finders
    let finders = [(0, 0), (0, size - 7), (size - 7, 0)];
    for &(top, left) in &finders {
        for r in -1..=7 {
            for c in -1..=7 {
                let nr = top as isize + r;
                let nc = left as isize + c;
                if nr >= 0 && nr < size as isize && nc >= 0 && nc < size as isize {
                    let (ur, uc) = (nr as usize, nc as usize);
                    if r >= 0 && r <= 6 && c >= 0 && c <= 6 {
                        let is_black = r == 0 || r == 6 || c == 0 || c == 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
                        set_module(&mut matrix, &mut is_reserved, ur, uc, if is_black { 1 } else { 0 }, true);
                    } else {
                        set_module(&mut matrix, &mut is_reserved, ur, uc, 0, true);
                    }
                }
            }
        }
    }

    // Timing
    for i in 8..(size - 8) {
        if matrix[6][i].is_none() {
            set_module(&mut matrix, &mut is_reserved, 6, i, if i % 2 == 0 { 1 } else { 0 }, true);
        }
        if matrix[i][6].is_none() {
            set_module(&mut matrix, &mut is_reserved, i, 6, if i % 2 == 0 { 1 } else { 0 }, true);
        }
    }

    // Alignment
    let coords = ALIGNMENT_COORDS[spec.version];
    for &cr in coords {
        for &cc in coords {
            if (cr == 6 && cc == 6)
                || (cr == 6 && cc == coords[coords.len() - 1])
                || (cr == coords[coords.len() - 1] && cc == 6)
            {
                continue;
            }
            for r in -2i32..=2i32 {
                for c in -2i32..=2i32 {
                    let is_black = max(r.abs(), c.abs()) != 1;
                    set_module(&mut matrix, &mut is_reserved, (cr as isize + r as isize) as usize, (cc as isize + c as isize) as usize, if is_black { 1 } else { 0 }, true);
                }
            }
        }
    }

    // Dark module
    set_module(&mut matrix, &mut is_reserved, size - 8, 8, 1, true);

    // Reserve format
    for i in 0..9 {
        if matrix[8][i].is_none() { set_module(&mut matrix, &mut is_reserved, 8, i, 0, true); }
        if matrix[i][8].is_none() { set_module(&mut matrix, &mut is_reserved, i, 8, 0, true); }
    }
    for i in (size - 8)..size {
        if matrix[8][i].is_none() { set_module(&mut matrix, &mut is_reserved, 8, i, 0, true); }
        if matrix[i][8].is_none() { set_module(&mut matrix, &mut is_reserved, i, 8, 0, true); }
    }

    // Zigzag placement
    let mut bit_idx = 0;
    let total_bits = codewords.len() * 8;
    let mut up = true;
    let mut col = size as isize - 1;
    while col > 0 {
        if col == 6 { col -= 1; }
        for row_step in 0..size {
            let row = if up { size - 1 - row_step } else { row_step };
            for c_offset in 0..2 {
                let c = (col - c_offset) as usize;
                if !is_reserved[row][c] {
                    let bit = if bit_idx < total_bits {
                        let byte = codewords[bit_idx / 8];
                        let b = (byte >> (7 - (bit_idx % 8))) & 1;
                        bit_idx += 1;
                        b
                    } else {
                        0
                    };
                    matrix[row][c] = Some(bit);
                }
            }
        }
        up = !up;
        col -= 2;
    }

    // Format Mask 0: (r + c) % 2 == 0
    for r in 0..size {
        for c in 0..size {
            if !is_reserved[r][c] {
                if (r + c) % 2 == 0 {
                    matrix[r][c] = Some(matrix[r][c].unwrap() ^ 1);
                }
            }
        }
    }

    // Format info 0x5412 (Level M, Mask 0)
    let format_info = 0x5412u16;
    for i in 0..15 {
        let bit = ((format_info >> i) & 1) as u8;
        if i < 6 { set_module(&mut matrix, &mut is_reserved, i, 8, bit, true); }
        else if i < 8 { set_module(&mut matrix, &mut is_reserved, i + 1, 8, bit, true); }
        else { set_module(&mut matrix, &mut is_reserved, size - 15 + i, 8, bit, true); }
    }
    for i in 0..15 {
        let bit = ((format_info >> i) & 1) as u8;
        if i < 8 { set_module(&mut matrix, &mut is_reserved, 8, size - i - 1, bit, true); }
        else if i < 9 { set_module(&mut matrix, &mut is_reserved, 8, 15 - i, bit, true); }
        else { set_module(&mut matrix, &mut is_reserved, 8, 15 - i - 1, bit, true); }
    }
    set_module(&mut matrix, &mut is_reserved, size - 8, 8, 1, true);

    matrix.into_iter().map(|row| row.into_iter().map(|c| c == Some(1)).collect()).collect()
}

pub fn render_qr_svg(text: &str, size: usize, margin: usize) -> String {
    let matrix = create_qr_matrix(text);
    let n = matrix.len();
    let total = n + margin * 2;
    let mut rects = String::new();

    for r in 0..n {
        let mut c = 0;
        while c < n {
            if matrix[r][c] {
                let start = c;
                while c < n && matrix[r][c] {
                    c += 1;
                }
                rects.push_str(&format!(
                    r#"<rect x="{}" y="{}" width="{}" height="1"/>"#,
                    start + margin,
                    r + margin,
                    c - start
                ));
            } else {
                c += 1;
            }
        }
    }

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}" width="{}" height="{}" shape-rendering="crispEdges">
  <rect width="{}" height="{}" fill="#ffffff"/>
  <g fill="#0b0f19">{}</g>
</svg>"##,
        total, total, size, size, total, total, rects
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wifi_qr_string_escaping_and_specs() {
        assert_eq!(
            build_wifi_qr_string("HomeWiFi", "SecretPass123", "WPA2-Personal"),
            "WIFI:T:WPA;S:HomeWiFi;P:SecretPass123;;"
        );
        assert_eq!(
            build_wifi_qr_string("Cafe;Special", r#"p:a;s\s"123"#, "WPA2"),
            r#"WIFI:T:WPA;S:Cafe\;Special;P:p\:a\;s\\s\"123;;"#
        );
        assert_eq!(
            build_wifi_qr_string("Public_Guest", "", "Open"),
            "WIFI:T:nopass;S:Public_Guest;;"
        );
        assert_eq!(
            build_wifi_qr_string("LegacyNet", "12345", "WEP"),
            "WIFI:T:WEP;S:LegacyNet;P:12345;;"
        );
    }

    #[test]
    fn test_qr_matrix_and_svg_rendering() {
        let payload = "WIFI:T:WPA;S:ACE-Ibadan;P:Skills-Setup@302026;;";
        let matrix = create_qr_matrix(payload);
        assert!(!matrix.is_empty());
        assert_eq!(matrix.len(), matrix[0].len());
        // Dark module check at (size - 8, 8)
        assert!(matrix[matrix.len() - 8][8]);

        let svg = render_qr_svg(payload, 240, 4);
        assert!(svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\""));
        assert!(svg.contains("viewBox="));
        assert!(svg.ends_with("</svg>"));
    }
}
