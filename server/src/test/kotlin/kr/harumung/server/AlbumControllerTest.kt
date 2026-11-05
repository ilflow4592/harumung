package kr.harumung.server

import kr.harumung.server.album.AlbumController
import kr.harumung.server.config.SecurityConfig
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@WebMvcTest(AlbumController::class)
@Import(SecurityConfig::class)
class AlbumControllerTest(@Autowired private val mvc: MockMvc) {

    @Test
    fun `토큰 32자면 앨범 페이지를 연다`() {
        mvc.get("/a/${"a".repeat(32)}").andExpect { status { isOk() } }
    }

    @Test
    fun `토큰 길이가 다르면 404`() {
        mvc.get("/a/short").andExpect { status { isNotFound() } }
    }
}
